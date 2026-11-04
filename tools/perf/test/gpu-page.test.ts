import { browserHosts } from "@racer/devtools/browser-host";
import type { BrowserHost } from "@racer/devtools/browser-host";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { readPages } from "../src/gpu.ts";

const RUNS = { A: "run-a", B: "run-b" };

interface Size {
  readonly dpr: number;
  readonly height: number;
  readonly width: number;
}

const factsOf = (size: Size) =>
  JSON.stringify({ ...size, frameRate: "60", refreshHz: 60 });

const readOn = async (
  host: Pick<BrowserHost, "id" | "page">,
  sizes: Readonly<Record<string, Size>>
) => {
  const processes = Layer.succeed(ToolProcesses)({
    commandOf: () => Effect.succeed(""),
    listed: Effect.succeed([]),
    listenerOf: () => Effect.succeed(null),
    run: (_file, args) =>
      Effect.sync(() => {
        const [, command, , run = ""] = args;
        const size = sizes[run];
        return {
          stderr: "",
          stdout: command === "js" && size !== undefined ? factsOf(size) : "",
        };
      }),
    runShown: () => Effect.die("nothing here runs a shown command"),
    spawnScoped: () => Effect.die("reading a page spawns nothing"),
    startDetached: () => Effect.die("reading a page starts nothing"),
    stopOwned: () => Effect.die("reading a page stops nothing"),
  });
  return await Effect.runPromise(
    readPages(RUNS, host).pipe(Effect.provide(processes))
  );
};

const NVIDIA_PAGE = { dpr: 2, height: 773, width: 1512 };
const TILED_PAGE = { dpr: 2, height: 433, width: 467 };

describe("the page perf:gpu judges", () => {
  it("accepts the page the NVIDIA rows came from", async () => {
    const read = await readOn(browserHosts["linux-nvidia"], {
      "run-a": NVIDIA_PAGE,
      "run-b": NVIDIA_PAGE,
    });
    expect(read).toMatchObject({
      kind: "read",
      page: { A: NVIDIA_PAGE, B: NVIDIA_PAGE },
    });
  });

  it("refuses a tiled page on NVIDIA, naming both sizes and the usual cause", async () => {
    const read = await readOn(browserHosts["linux-nvidia"], {
      "run-a": TILED_PAGE,
      "run-b": TILED_PAGE,
    });
    const line = read.kind === "refused" ? read.line : "";
    expect(line).toContain("467x433@2");
    expect(line).toContain("1512x773@2");
    expect(line).toContain("A compositor rv did not start is the usual cause");
  });

  it.for(["macos-metal", "linux-intel"] as const)(
    "lets %s keep any page, because it has no page to hold",
    async (id) => {
      const read = await readOn(browserHosts[id], {
        "run-a": TILED_PAGE,
        "run-b": TILED_PAGE,
      });
      expect(read.kind).toBe("read");
    }
  );

  it("still refuses two runs on different pages, and names both", async () => {
    const read = await readOn(browserHosts["macos-metal"], {
      "run-a": NVIDIA_PAGE,
      "run-b": TILED_PAGE,
    });
    expect(read).toStrictEqual({
      kind: "refused",
      line: "FAIL viewport A=1512x773@2 B=467x433@2: restart the run whose window was resized",
    });
  });
});
