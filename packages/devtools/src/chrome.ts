import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as Schema from "effect/Schema";

import { BrowserError } from "./browser-error.ts";
import { CurrentHost } from "./browser-host.ts";
import type { BrowserHost, BrowserMode, DesktopEnv } from "./browser-host.ts";
import { connect } from "./cdp.ts";
import { released } from "./cleanup.ts";
import { ToolProcesses } from "./process.ts";

const STARTUP_ATTEMPTS = 150;
const STARTUP_POLL_MS = 100;

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

const decodeTargets = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        type: Schema.String,
        url: Schema.String,
        webSocketDebuggerUrl: Schema.optionalKey(Schema.String),
      })
    )
  )
);

const profileFlag = (profile: string): string => `--user-data-dir=${profile}`;

export const sharedFlags = (
  gpuFlags: readonly string[],
  port: number,
  profile: string,
  viewport: Viewport
): string[] => [
  profileFlag(profile),
  `--remote-debugging-port=${port}`,
  `--window-size=${viewport.width},${viewport.height}`,
  ...gpuFlags,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

const benchFlags = (
  host: BrowserHost,
  mode: BrowserMode,
  port: number,
  profile: string,
  viewport: Viewport
): string[] => [
  ...(mode === "headless" ? ["--headless=new"] : []),
  ...sharedFlags(host[mode].flags, port, profile, viewport),
  `--force-device-scale-factor=${viewport.scale}`,
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
  "--mute-audio",
  "--disable-extensions",
  "about:blank",
];

export const pageTarget = Effect.fn("chrome.pageTarget")(
  function* pageTarget(port: number, origin: string) {
    const response = yield* HttpClient.get(
      `http://127.0.0.1:${port}/json/list`
    );
    const listed = yield* decodeTargets(yield* response.text);
    return listed.find(
      (target) => target.type === "page" && target.url.startsWith(origin)
    )?.webSocketDebuggerUrl;
  },
  Effect.orElseSucceed((): string | undefined => undefined)
);

const pageSocket = Effect.fnUntraced(function* pageSocket(port: number) {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    yield* Effect.sleep(STARTUP_POLL_MS);
    const page = yield* pageTarget(port, "");
    if (page !== undefined) {
      return page;
    }
  }
  return yield* new BrowserError({
    message: `The browser did not open DevTools on port ${port}.`,
    operation: "discover",
    port,
  });
});

const portAnswers = (port: number) =>
  HttpClient.get(`http://127.0.0.1:${port}/json/version`).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  );

const awaitListener = Effect.fnUntraced(function* awaitListener(port: number) {
  const processes = yield* ToolProcesses;
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
    const pid = yield* processes.listenerOf(port);
    if (pid !== null) {
      return pid;
    }
    yield* Effect.sleep(STARTUP_POLL_MS);
  }
  return yield* new BrowserError({
    message: `Nothing started listening on port ${port}.`,
    operation: "listen",
    port,
  });
});

export const awaitPortClosed = Effect.fn("chrome.awaitPortClosed")(
  function* awaitPortClosed(port: number) {
    const processes = yield* ToolProcesses;
    let attempt = 0;
    while ((yield* processes.listenerOf(port)) !== null) {
      if (attempt >= STARTUP_ATTEMPTS) {
        return false;
      }
      yield* Effect.sleep(STARTUP_POLL_MS);
      attempt += 1;
    }
    return true;
  }
);

export const stopProfileBrowser = Effect.fn("chrome.stopProfileBrowser")(
  function* stopProfileBrowser(profile: string) {
    const processes = yield* ToolProcesses;
    const flag = profileFlag(profile);
    const owner = (yield* processes.listed).find(
      (each) => each.command.includes(flag) && !each.command.includes("--type=")
    );
    return yield* processes.stopOwned(owner?.pid ?? null, flag);
  }
);

export interface WindowedStart {
  readonly env: NodeJS.ProcessEnv;
  readonly log: string;
}

const openWindowed = (
  { windowed: { launcher } }: BrowserHost,
  flags: readonly string[],
  { env, log }: WindowedStart
) =>
  ToolProcesses.use((processes) => {
    switch (launcher.kind) {
      case "open": {
        return processes
          .run("open", ["-g", "-n", "-a", launcher.app, "--args", ...flags])
          .pipe(Effect.asVoid);
      }
      case "direct": {
        return processes
          .startDetached(launcher.binary, flags, path.dirname(log), log, env)
          .pipe(Effect.asVoid);
      }
      default: {
        return launcher satisfies never;
      }
    }
  });

const listening = Effect.fnUntraced(function* listening(
  host: BrowserHost,
  flags: readonly string[],
  port: number,
  profile: string,
  start: WindowedStart
) {
  const processes = yield* ToolProcesses;
  yield* openWindowed(host, flags, start);
  const pid = yield* awaitListener(port);
  const command = yield* processes.commandOf(pid);
  if (!command.includes(profileFlag(profile))) {
    return yield* new BrowserError({
      browser: host.id,
      message: `Port ${port} is held by pid ${pid}, not the browser this run started.`,
      operation: "listen",
      port,
    });
  }
  return pid;
});

export const startInBackground = (
  host: BrowserHost,
  flags: readonly string[],
  port: number,
  profile: string,
  start: WindowedStart
) =>
  listening(host, flags, port, profile, start).pipe(
    Effect.onError(() => released(stopProfileBrowser(profile)))
  );

const temporaryProfile = Effect.gen(function* temporaryProfile() {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.acquireRelease(
    fs.makeTempDirectory({ prefix: "rushline-perf-" }),
    (profile) => released(fs.remove(profile, { force: true, recursive: true }))
  );
});

const launchWindowed = (
  host: BrowserHost,
  flags: readonly string[],
  port: number,
  profile: string,
  start: WindowedStart
) =>
  Effect.acquireRelease(
    startInBackground(host, flags, port, profile, start),
    (pid) =>
      released(
        ToolProcesses.use((processes) =>
          processes.stopOwned(pid, profileFlag(profile))
        ).pipe(Effect.andThen(awaitPortClosed(port)))
      ),
    { interruptible: true }
  );

export const launch = Effect.fn("chrome.launch")(function* launch(
  port: number,
  viewport: Viewport,
  mode: BrowserMode,
  desktopEnv: DesktopEnv
) {
  const host = yield* CurrentHost;
  if (yield* portAnswers(port)) {
    return yield* new BrowserError({
      browser: host.id,
      message: `Port ${port} already answers; pick another with --port.`,
      operation: "launch",
      port,
    });
  }
  const profile = yield* temporaryProfile;
  const flags = benchFlags(host, mode, port, profile, viewport);
  switch (mode) {
    case "headless": {
      const processes = yield* ToolProcesses;
      yield* processes.spawnScoped(host.headless.binary, flags, {
        ...process.env,
        ...host.headless.env,
      });
      break;
    }
    case "windowed": {
      yield* launchWindowed(host, flags, port, profile, {
        env: { ...process.env, ...host.windowed.env, ...desktopEnv },
        log: path.join(profile, "browser.log"),
      });
      break;
    }
    default: {
      return mode satisfies never;
    }
  }
  return yield* connect(yield* pageSocket(port));
});
