import { tmpdir } from "node:os";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { alive } from "./process.ts";

export const toolStateDir = path.join(tmpdir(), "rushline-verify");

const claimBody = Schema.Struct({ label: Schema.String, pid: Schema.Number });

type ClaimBody = typeof claimBody.Type;

interface HeldClaim {
  readonly holder: ClaimBody;
  readonly kind: "held";
}

type ClaimOutcome = { readonly kind: "taken" } | HeldClaim;

type ClaimReading =
  | { readonly kind: "absent" }
  | { readonly kind: "dead" }
  | HeldClaim;

const decodeClaim = Schema.decodeUnknownOption(
  Schema.fromJsonString(claimBody)
);

const readingOf = (file: string) =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(file)).pipe(
    Effect.map((text): ClaimReading => {
      const holder = Option.getOrNull(decodeClaim(text));
      return holder !== null && alive(holder.pid)
        ? { holder, kind: "held" }
        : { kind: "dead" };
    }),
    Effect.catchReason("PlatformError", "NotFound", () =>
      Effect.succeed<ClaimReading>({ kind: "absent" })
    )
  );

const claimWith = (
  file: string,
  draft: string
): Effect.Effect<
  ClaimOutcome,
  PlatformError.PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* attempt() {
    const fs = yield* FileSystem.FileSystem;
    const linked = yield* fs.link(draft, file).pipe(
      Effect.as(true),
      Effect.catchReason("PlatformError", "AlreadyExists", () =>
        Effect.succeed(false)
      )
    );
    if (linked) {
      const taken: ClaimOutcome = { kind: "taken" };
      return taken;
    }
    const reading = yield* readingOf(file);
    switch (reading.kind) {
      case "absent": {
        return yield* claimWith(file, draft);
      }
      case "held": {
        return reading;
      }
      case "dead": {
        const guard = `${file}.clearing`;
        const clearing = yield* claimWith(guard, draft);
        if (clearing.kind === "held") {
          return clearing;
        }
        const underGuard = yield* readingOf(file);
        if (underGuard.kind === "dead") {
          yield* fs.remove(file, { force: true });
        }
        yield* fs.remove(guard, { force: true });
        return yield* claimWith(file, draft);
      }
      default: {
        return reading satisfies never;
      }
    }
  });

export const claimHolder = (file: string) =>
  readingOf(file).pipe(
    Effect.map((reading) => (reading.kind === "held" ? reading.holder : null))
  );

export const takeClaim = Effect.fn("claim.take")(function* takeClaim(
  file: string,
  label: string
) {
  const fs = yield* FileSystem.FileSystem;
  const directory = path.dirname(file);
  yield* fs.makeDirectory(directory, { recursive: true });
  const draft = yield* fs.makeTempFileScoped({
    directory,
    prefix: `${path.basename(file)}.`,
  });
  yield* fs.writeFileString(draft, JSON.stringify({ label, pid: process.pid }));
  return yield* claimWith(file, draft);
}, Effect.scoped);

export const dropClaim = (file: string) =>
  FileSystem.FileSystem.use((fs) => fs.remove(file, { force: true }));
