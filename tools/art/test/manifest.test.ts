import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import {
  holdsKey,
  keyOf,
  manifestText,
  readManifest,
} from "../src/manifest.ts";

const bytes = new TextEncoder().encode("glTF fixture");

const decoded = async (text: string) => {
  const file = path.join(
    mkdtempSync(path.join(os.tmpdir(), "art-")),
    "art.json"
  );
  writeFileSync(file, text);
  return await Effect.runPromise(
    readManifest(file).pipe(Effect.provide(NodeServices.layer))
  );
};

describe("art manifest", () => {
  it("keys art by its content so changed bytes get a new URL", () => {
    const key = keyOf(bytes, "glb");
    expect(key).toMatch(/^[0-9a-f]{32}\.glb$/u);
    expect(holdsKey(key, bytes)).toBeTruthy();
    expect(holdsKey(key, new TextEncoder().encode("glTF changed"))).toBeFalsy();
  });

  it("round-trips a sorted manifest and refuses a key that is not a hash", async () => {
    const manifest = {
      "clubhouse/wall.webp": keyOf(bytes, "webp"),
      "models/van.glb": keyOf(bytes, "glb"),
    };
    const text = manifestText(manifest);
    expect(text.match(/"[^"]+":/gu)).toStrictEqual([
      '"clubhouse/wall.webp":',
      '"models/van.glb":',
    ]);
    await expect(decoded(text)).resolves.toStrictEqual(manifest);
    await expect(
      decoded(JSON.stringify({ "models/van.glb": "van.glb" }))
    ).rejects.toThrow("is not an art manifest");
  });
});
