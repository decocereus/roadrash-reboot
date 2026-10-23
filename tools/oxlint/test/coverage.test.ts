import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import antiSlopPlugin from "../anti-slop/index.ts";
import rushlinePlugin from "../rushline/index.ts";

describe("Lint plugins", () => {
  it("have tests for every rule they register", () => {
    const testsDir = new URL(".", import.meta.url);
    const tested = new Set(
      readdirSync(testsDir)
        .filter((file) => file.endsWith(".test.ts"))
        .flatMap((file) =>
          [
            ...readFileSync(new URL(file, testsDir), "utf-8").matchAll(
              /\brunRule\(\s*"(?<rule>[a-z-]+\/[a-z-]+)"/gu
            ),
          ].map((match) => match.groups?.rule)
        )
    );
    const untested = [
      ...Object.keys(antiSlopPlugin.rules).map((rule) => `anti-slop/${rule}`),
      ...Object.keys(rushlinePlugin.rules).map((rule) => `rushline/${rule}`),
    ].filter((name) => !tested.has(name));
    expect(untested).toStrictEqual([]);
  });
});
