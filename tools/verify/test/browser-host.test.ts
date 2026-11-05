import { once } from "node:events";
import { createServer } from "node:net";

import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import {
  browserHosts,
  hostOf,
  perfEnvironments,
} from "@racer/devtools/browser-host";
import { ToolProcesses } from "@racer/devtools/process";
import type { ProcessError } from "@racer/devtools/process-error";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const linux = browserHosts["linux-nvidia"];
const macos = browserHosts["macos-metal"];

const spawner = NodeChildProcessSpawner.layer.pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
);

const realProcesses = ToolProcesses.layer.pipe(Layer.provide(spawner));

const decodeAddress = Schema.decodeUnknownSync(
  Schema.Struct({ port: Schema.Number })
);

const run = async <A>(
  effect: Effect.Effect<A, ProcessError, ToolProcesses>,
  layer: Layer.Layer<ToolProcesses> = realProcesses
) => await Effect.runPromiseExit(effect.pipe(Effect.provide(layer)));

describe("browser hosts", () => {
  it.for([
    {
      environment: "gpu-helium-metal",
      mark: "Metal",
      on: "darwin",
      process: "Helium",
    },
    {
      environment: "gpu-chromium-nvidia",
      mark: "NVIDIA",
      on: "linux",
      process: "chromium",
    },
  ] as const)(
    "picks the $mark row on $on",
    ({ environment, mark, on, process: browser }) => {
      const host = hostOf(on);
      expect(host.rendererMark).toBe(mark);
      expect(host.perfEnvironment).toBe(environment);
      expect(host.processMark).toBe(browser);
    }
  );

  it("refuses a platform with no row and names it", () => {
    expect(() => hostOf("win32")).toThrow("No browser host for win32");
  });

  it("keeps NVIDIA the default on Linux and lets the setting choose Intel", () => {
    expect(hostOf("linux").id).toBe("linux-nvidia");
    expect(hostOf("linux", "").id).toBe("linux-nvidia");
    const intel = hostOf("linux", "linux-intel");
    expect(intel.rendererMark).toBe("Intel");
    expect(intel.windowed.env).toStrictEqual({});
    expect(intel.windowed.viewport).toStrictEqual({
      height: 1080,
      scale: 1,
      width: 1920,
    });
  });

  it("refuses a setting outside the tuple and names the choices", () => {
    expect(() => hostOf("linux", "linux-amd")).toThrow(
      "use macos-metal, linux-nvidia, linux-intel"
    );
  });

  it("refuses a host from another platform", () => {
    expect(() => hostOf("darwin", "linux-intel")).toThrow(
      "runs on linux, and this machine is darwin"
    );
  });

  it("requires budget rows for every host", () => {
    expect(perfEnvironments).toStrictEqual([
      "gpu-helium-metal",
      "gpu-chromium-nvidia",
      "gpu-chromium-intel",
    ]);
  });

  it("keeps macOS on Metal through open -g, with no desktop session", () => {
    expect(macos.desktop).toBe("none");
    expect(macos.windowed.flags).toContain("--use-angle=metal");
    expect(macos.windowed.launcher).toStrictEqual({
      app: "/Applications/Helium.app",
      kind: "open",
    });
    expect(macos.headless.binary).toContain("Google Chrome");
  });

  it("leaves the sandbox on and the owner's chromium flags out on Linux", () => {
    expect(linux.desktop).toBe("hyprland");
    for (const flags of [linux.headless.flags, linux.windowed.flags]) {
      expect(flags).not.toContain("--no-sandbox");
    }
    expect(linux.headless.binary).toBe("/usr/lib/chromium/chromium");
    expect(linux.windowed.launcher).toStrictEqual({
      binary: "/usr/lib/chromium/chromium",
      kind: "direct",
    });
  });
});

describe("listener probes", () => {
  it.for([
    {
      expected: 218_888,
      name: "a listening browser",
      stdout:
        'LISTEN 0      10     127.0.0.1:9711 0.0.0.0:* users:(("chromium",pid=218888,fd=88))\n',
    },
    {
      expected: 1071,
      name: "the first of two sockets on one port",
      stdout:
        'LISTEN 0 511 127.0.0.1:1351 0.0.0.0:* users:(("node",pid=1071,fd=23))\nLISTEN 0 511 [::1]:1351 [::]:* users:(("node",pid=2071,fd=24))\n',
    },
    { expected: null, name: "a free port", stdout: "" },
    {
      expected: null,
      name: "another user's socket, which ss shows without a pid",
      stdout: "LISTEN 0 128 0.0.0.0:22 0.0.0.0:*\n",
    },
  ])("ss reads $name", ({ expected, stdout }) => {
    expect(linux.listener.pidIn(stdout)).toBe(expected);
  });

  it("ss filters on the source port as one argument", () => {
    expect(linux.listener.args(1410)).toStrictEqual([
      "-ltnpH",
      "sport = :1410",
    ]);
  });

  it.for([
    { expected: 41_002, stdout: "41002\n41003\n" },
    { expected: null, stdout: "" },
  ])("lsof reads the first pid of $stdout", ({ expected, stdout }) => {
    expect(macos.listener.pidIn(stdout)).toBe(expected);
  });
});

describe("listenerOf on this machine", () => {
  const server = createServer();
  let port = 0;

  beforeAll(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    ({ port } = decodeAddress(server.address()));
  });

  afterAll(async () => {
    server.close();
    await once(server, "close");
  });

  it("finds the process that holds a real port", async () => {
    const exit = await run(
      ToolProcesses.use((processes) => processes.listenerOf(port))
    );
    expect(exit).toStrictEqual(Exit.succeed(process.pid));
  });

  it("answers null for a port nothing holds", async () => {
    const exit = await run(
      ToolProcesses.use((processes) => processes.listenerOf(1))
    );
    expect(exit).toStrictEqual(Exit.succeed(null));
  });

  it("dies rather than reporting a free port when the probe tool is missing", async () => {
    const exit = await run(
      ToolProcesses.use((processes) => processes.listenerOf(port)),
      ToolProcesses.layerUsing({
        args: () => [],
        file: "rushline-no-such-probe",
        pidIn: () => null,
      }).pipe(Layer.provide(spawner))
    );
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBeTruthy();
  });
});
