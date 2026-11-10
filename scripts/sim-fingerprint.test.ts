import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { simFingerprint } from "@racer/rooms/sim-fingerprint";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vitest";

const SOURCES = ["apps/rooms/src", "packages/sim/src", "packages/track/src"];

const fingerprintOf = async (root: string): Promise<string> =>
  await Effect.runPromise(
    simFingerprint(root).pipe(Effect.provide(NodeFileSystem.layer))
  );

const roots: string[] = [];

const treeOf = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(path.join(tmpdir(), "rushline-sim-"));
  roots.push(root);
  for (const folder of SOURCES) {
    mkdirSync(path.join(root, folder), { recursive: true });
  }
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
};

const base = {
  "apps/rooms/src/host.test.ts": "it('a', () => {});\n",
  "apps/rooms/src/host.ts": "export const host = 1;\n",
  "packages/sim/src/room.ts": "export const room = 1;\n",
  "packages/track/src/tracks/one.ts": "export const one = 1;\n",
};

describe("the simulation fingerprint", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("is the same for the same sources with either line ending, and ignores tests", async () => {
    const lf = await fingerprintOf(treeOf(base));
    const crlf = await fingerprintOf(
      treeOf({
        ...base,
        "apps/rooms/src/host.test.ts": "it('b', () => {});\n",
        "apps/rooms/src/host.ts": "export const host = 1;\r\n",
      })
    );
    expect(crlf).toBe(lf);
    expect(lf).toMatch(/^[\da-f]{32}$/u);
  });

  it("changes when the rooms code, the simulation or a track source changes", async () => {
    const lf = await fingerprintOf(treeOf(base));
    const rooms = await fingerprintOf(
      treeOf({ ...base, "apps/rooms/src/host.ts": "export const host = 2;\n" })
    );
    const sim = await fingerprintOf(
      treeOf({
        ...base,
        "packages/sim/src/room.ts": "export const room = 2;\n",
      })
    );
    const track = await fingerprintOf(
      treeOf({
        ...base,
        "packages/track/src/tracks/one.ts": "export const one = 2;\n",
      })
    );
    expect(new Set([lf, rooms, sim, track]).size).toBe(4);
  });
});
