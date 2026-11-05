import { tmpdir } from "node:os";
import path from "node:path";

import type { YieldableError } from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { released } from "./cleanup.ts";
import { alive } from "./process.ts";

export const toolStateDir = path.join(tmpdir(), "rushline-verify");

const CLAIM_POLL_MS = 50;
const CLAIM_ATTEMPTS = 1200;

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

const takeClaim = Effect.fn("claim.take")(function* takeClaim(
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

const dropClaim = (file: string) =>
  FileSystem.FileSystem.use((fs) => fs.remove(file, { force: true }));

const awaitClaim = <Stuck extends YieldableError>(
  file: string,
  label: string,
  stuck: (holder: ClaimBody) => Stuck
) =>
  Effect.gen(function* untilTaken() {
    let outcome = yield* takeClaim(file, label);
    for (
      let attempt = 0;
      outcome.kind === "held" && attempt < CLAIM_ATTEMPTS;
      attempt += 1
    ) {
      yield* Effect.sleep(CLAIM_POLL_MS);
      outcome = yield* takeClaim(file, label);
    }
    if (outcome.kind === "held") {
      yield* stuck(outcome.holder);
    }
  });

export const underClaim = <A, E, R, Stuck extends YieldableError>(
  file: string,
  label: string,
  step: Effect.Effect<A, E, R>,
  stuck: (holder: ClaimBody) => Stuck
) =>
  Effect.acquireUseRelease(
    Effect.interruptible(awaitClaim(file, label, stuck)),
    () => step,
    () => released(dropClaim(file))
  );
