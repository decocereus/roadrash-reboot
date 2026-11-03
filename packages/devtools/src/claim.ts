import { tmpdir } from "node:os";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { alive } from "./process.ts";

export const toolStateDir = path.join(tmpdir(), "rushline-verify");

const claimBody = Schema.Struct({ label: Schema.String, pid: Schema.Number });

type ClaimBody = typeof claimBody.Type;

type ClaimOutcome =
  | { readonly kind: "taken" }
  | { readonly holder: ClaimBody; readonly kind: "held" };

const decodeClaim = Schema.decodeUnknownOption(
  Schema.fromJsonString(claimBody)
);

const claimOnce = Effect.fnUntraced(function* claimOnce(
  file: string,
  draft: string
) {
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
  const holder = yield* fs.readFileString(file).pipe(
    Effect.map((text) => Option.getOrNull(decodeClaim(text))),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(null))
  );
  if (holder !== null && alive(holder.pid)) {
    const held: ClaimOutcome = { holder, kind: "held" };
    return held;
  }
  yield* fs.remove(file, { force: true });
  return null;
});

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
  let outcome: ClaimOutcome | null = null;
  while (outcome === null) {
    outcome = yield* claimOnce(file, draft);
  }
  return outcome;
}, Effect.scoped);

export const dropClaim = (file: string) =>
  FileSystem.FileSystem.use((fs) => fs.remove(file, { force: true }));
