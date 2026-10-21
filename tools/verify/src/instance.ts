import path from "node:path";

import {
  awaitPortClosed,
  browsers,
  sharedFlags,
  startInBackground,
  stopProfileBrowser,
} from "@racer/devtools/chrome";
import { released } from "@racer/devtools/cleanup";
import { ToolProcesses } from "@racer/devtools/process";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as Option from "effect/Option";

import { SlotStore, VIEWPORT, serverPortOf } from "./state.ts";
import type { InstanceState } from "./state.ts";
import { VerificationError } from "./verification-error.ts";

const POLL_MS = 200;

const SERVER_ATTEMPTS = 300;

const SERVER_COMMAND = "vite.js";

const WATCHER_COMMAND = "rushline.ts";

export const git = Effect.fn("rv.git")(function* git(
  cwd: string,
  args: readonly string[]
) {
  const processes = yield* ToolProcesses;
  const { stdout } = yield* processes.run("git", args, { cwd });
  return stdout.trim();
});

export const checkoutRoot = Effect.suspend(() =>
  git(process.cwd(), ["rev-parse", "--show-toplevel"])
);

export const evidenceRoot = Effect.fn("rv.evidenceRoot")(function* evidenceRoot(
  checkout: string
) {
  const common = yield* git(checkout, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return path.join(path.dirname(common), "tools/perf/results/verify");
});

const vitePath = (checkout: string): string =>
  path.join(checkout, "apps/web/node_modules/vite/bin/vite.js");

const webDir = (checkout: string): string => path.join(checkout, "apps/web");

export const buildDirFor = (checkout: string, slot: number): string =>
  path.join(webDir(checkout), "node_modules/.rushline-verify", `slot-${slot}`);

const devEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_ENV: "development",
});

export const build = Effect.fn("rv.build")(function* build(
  state: InstanceState
) {
  const processes = yield* ToolProcesses;
  const fs = yield* FileSystem.FileSystem;
  const buildDir = buildDirFor(state.checkout, state.slot);
  const sha = yield* git(state.checkout, ["rev-parse", "--short", "HEAD"]);
  const dirty = yield* git(state.checkout, ["status", "--porcelain"]);
  const builtAt = yield* Clock.currentTimeMillis;
  const output = yield* processes.run(
    process.execPath,
    [
      vitePath(state.checkout),
      "build",
      "--mode",
      "development",
      "--outDir",
      buildDir,
      "--emptyOutDir",
    ],
    { cwd: webDir(state.checkout), env: devEnv() }
  );
  yield* fs.writeFileString(
    path.join(state.evidence, "build.log"),
    `${output.stdout}\n${output.stderr}`
  );
  const built: InstanceState = {
    ...state,
    buildDir,
    builtAt,
    builtFrom: dirty === "" ? sha : `${sha}+uncommitted`,
  };
  return built;
});

const serverArgs = (state: InstanceState): string[] => {
  const port = String(serverPortOf(state.slot));
  const common = ["--host", "127.0.0.1", "--port", port, "--strictPort"];
  if (state.serverMode === "dev") {
    return [vitePath(state.checkout), "--mode", "development", ...common];
  }
  return [
    vitePath(state.checkout),
    "preview",
    "--mode",
    "development",
    "--outDir",
    state.buildDir ?? "",
    ...common,
  ];
};

export const serverAnswers = (url: string) =>
  HttpClient.get(url).pipe(
    Effect.flatMap((response) =>
      response.text.pipe(
        Effect.map(
          (body) =>
            response.status >= 200 &&
            response.status < 300 &&
            body.includes("<title>Rushline</title>")
        )
      )
    ),
    Effect.orElseSucceed(() => false)
  );

const awaitServer = Effect.fnUntraced(function* awaitServer(url: string) {
  let attempt = 0;
  while (!(yield* serverAnswers(url))) {
    if (attempt >= SERVER_ATTEMPTS) {
      yield* new VerificationError({
        message: `The server at ${url} never served the Rushline page.`,
        operation: "serve",
      });
    }
    yield* Effect.sleep(POLL_MS);
    attempt += 1;
  }
});

const persistStarted = (pid: number, command: string, next: InstanceState) =>
  SlotStore.use((slots) => slots.writeState(next)).pipe(
    Effect.onError(() =>
      released(
        ToolProcesses.use((processes) => processes.stopOwned(pid, command))
      )
    ),
    Effect.as(next)
  );

export const startServer = Effect.fn("rv.startServer")(function* startServer(
  state: InstanceState
) {
  const processes = yield* ToolProcesses;
  const next = yield* Effect.uninterruptible(
    processes
      .startDetached(
        serverArgs(state),
        webDir(state.checkout),
        path.join(state.evidence, "server.log"),
        devEnv()
      )
      .pipe(
        Effect.flatMap((pid) =>
          persistStarted(pid, SERVER_COMMAND, { ...state, serverPid: pid })
        )
      )
  );
  yield* awaitServer(state.serverUrl);
  const listener = yield* processes.listenerOf(serverPortOf(state.slot));
  if (listener !== next.serverPid) {
    return yield* new VerificationError({
      message: `Port ${serverPortOf(state.slot)} is held by pid ${listener}, not the server this run started (${next.serverPid}).`,
      operation: "serve",
      run: state.run,
    });
  }
  return next;
});

export const startBrowser = Effect.fn("rv.startBrowser")(function* startBrowser(
  state: InstanceState,
  url: string
) {
  const flags = [
    ...sharedFlags(state.devtoolsPort, state.profile, VIEWPORT),
    ...(state.sound ? [] : ["--mute-audio"]),
    url,
  ];
  const pid = yield* startInBackground(
    browsers.helium,
    flags,
    state.devtoolsPort,
    state.profile
  );
  const started: InstanceState = { ...state, browserPid: pid };
  return started;
});

export const startWatcher = Effect.fn("rv.startWatcher")(function* startWatcher(
  state: InstanceState,
  script: string
) {
  const processes = yield* ToolProcesses;
  return yield* Effect.uninterruptible(
    processes
      .startDetached(
        [script, "watch", "--run", state.run],
        state.checkout,
        path.join(state.evidence, "watch.log"),
        devEnv()
      )
      .pipe(
        Effect.flatMap((pid) =>
          persistStarted(pid, WATCHER_COMMAND, { ...state, watcherPid: pid })
        )
      )
  );
});

export const stopServer = Effect.fn("rv.stopServer")(function* stopServer(
  state: InstanceState
) {
  if (state.serverMode === "external") {
    return "external server left running";
  }
  const processes = yield* ToolProcesses;
  const result = yield* processes.stopOwned(state.serverPid, SERVER_COMMAND);
  yield* awaitPortClosed(serverPortOf(state.slot));
  return result;
});

export const stopBrowser = Effect.fn("rv.stopBrowser")(function* stopBrowser(
  state: InstanceState
) {
  const processes = yield* ToolProcesses;
  const result =
    state.browserPid === null
      ? yield* stopProfileBrowser(state.profile)
      : yield* processes.stopOwned(state.browserPid, "Helium");
  yield* awaitPortClosed(state.devtoolsPort);
  return result;
});

export const stopWatcher = (state: InstanceState) =>
  ToolProcesses.use((processes) =>
    processes.stopOwned(state.watcherPid, WATCHER_COMMAND)
  );

export const newestSourceChange = Effect.fn("rv.newestSourceChange")(
  function* newestSourceChange(checkout: string) {
    const fs = yield* FileSystem.FileSystem;
    const roots = ["apps/web/src", "apps/web/public", "packages"].map((each) =>
      path.join(checkout, each)
    );
    const listed = yield* Effect.all(
      roots.map((root) =>
        Effect.map(fs.readDirectory(root, { recursive: true }), (names) =>
          names
            .filter((name) => !name.includes("node_modules"))
            .map((name) => path.join(root, name))
        )
      ),
      { concurrency: "unbounded" }
    );
    const times = yield* Effect.all(
      listed.flat().map((file) =>
        Effect.map(fs.stat(file), (info) =>
          Option.match(info.mtime, {
            onNone: () => 0,
            onSome: (mtime) => mtime.getTime(),
          })
        )
      ),
      { concurrency: "unbounded" }
    );
    return Math.max(0, ...times);
  }
);
