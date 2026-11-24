import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POSE_FRAMES } from "../src/game/assets.ts";

const table = readFileSync(
  path.join(import.meta.dirname, "../../../tools/blender/rider_poses.py"),
  "utf-8"
);

const namesIn = (tuple: string): string[] => {
  const found = new RegExp(String.raw`^${tuple} = \(([^)]*)\)`, "mu").exec(
    table
  );
  if (found?.[1] === undefined) {
    throw new Error(`rider_poses.py has no ${tuple}.`);
  }
  return [...found[1].matchAll(/"(?<name>[a-z_]+)"/gu)].map(
    (match) => match.groups?.name ?? ""
  );
};

describe("a rider's pose clip", () => {
  it("is read frame by frame under the names the Blender rig writes it with", () => {
    const unused = new Set(namesIn("UNUSED"));
    expect(
      namesIn("POSE_FRAMES").map((name) => (unused.has(name) ? null : name))
    ).toStrictEqual(POSE_FRAMES);
  });
});
