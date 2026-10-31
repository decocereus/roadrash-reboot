import { createHash } from "node:crypto";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { ArtRejected } from "./art-rejected.ts";

export const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
export const manifestFile = path.join(
  repositoryRoot,
  "apps/web/src/assets/art.json"
);

export const artExtensions = ["glb", "webp"] as const;
export type ArtExtension = (typeof artExtensions)[number];

export const contentTypes = {
  glb: "model/gltf-binary",
  webp: "image/webp",
} as const satisfies Record<ArtExtension, string>;

const HASH_LENGTH = 32;
const keyPattern = new RegExp(
  `^[0-9a-f]{${HASH_LENGTH}}\\.(?:${artExtensions.join("|")})$`,
  "u"
);
const namePattern = new RegExp(
  `^[a-z0-9][a-z0-9_/-]*\\.(?:${artExtensions.join("|")})$`,
  "u"
);

export const ArtKey = Schema.String.check(Schema.isPattern(keyPattern));
export const ArtName = Schema.String.check(Schema.isPattern(namePattern));

export const Manifest = Schema.Record(ArtName, ArtKey);
export type ArtManifest = typeof Manifest.Type;

const decodeManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Manifest)
);

export const extensionOf = (file: string): ArtExtension | null =>
  artExtensions.find((each) => file.endsWith(`.${each}`)) ?? null;

export const hashOf = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex").slice(0, HASH_LENGTH);

export const keyOf = (bytes: Uint8Array, extension: ArtExtension): string =>
  `${hashOf(bytes)}.${extension}`;

export const holdsKey = (key: string, bytes: Uint8Array): boolean =>
  key.startsWith(`${hashOf(bytes)}.`);

export const readManifest = Effect.fn("art.readManifest")(
  function* readManifest(file: string = manifestFile) {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* decodeManifest(text).pipe(
      Effect.mapError(
        (cause) =>
          new ArtRejected({
            cause,
            message: `${path.relative(repositoryRoot, file)} is not an art manifest.`,
          })
      )
    );
  }
);

export const manifestText = (manifest: ArtManifest): string =>
  `${JSON.stringify(
    Object.fromEntries(
      Object.entries(manifest).toSorted(([a], [b]) => (a < b ? -1 : 1))
    ),
    null,
    2
  )}\n`;
