import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as Schema from "effect/Schema";

import { BrowserError } from "./browser-error.ts";
import { connect } from "./cdp.ts";
import { released } from "./cleanup.ts";
import { ToolProcesses } from "./process.ts";

export type BrowserName = "chrome" | "helium";

export interface BrowserChoice {
  readonly name: BrowserName;
  readonly app: string;
  readonly binary: string;
  readonly headless: boolean;
}

export const browsers = {
  chrome: {
    app: "/Applications/Google Chrome.app",
    binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    name: "chrome",
  },
  helium: {
    app: "/Applications/Helium.app",
    binary: "/Applications/Helium.app/Contents/MacOS/Helium",
    headless: false,
    name: "helium",
  },
} satisfies Readonly<Record<BrowserName, BrowserChoice>>;

export const browserNamed = (name: string): BrowserChoice => {
  const found = Object.values(browsers).find((each) => each.name === name);
  if (!found) {
    throw new Error(`Unknown browser ${name}; use chrome or helium.`);
  }
  return found;
};

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
  port: number,
  profile: string,
  viewport: Viewport
): string[] => [
  profileFlag(profile),
  `--remote-debugging-port=${port}`,
  `--window-size=${viewport.width},${viewport.height}`,
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

const chromeFlags = (
  port: number,
  profile: string,
  viewport: Viewport,
  browser: BrowserChoice = browsers.chrome
): string[] => [
  ...(browser.headless ? ["--headless=new"] : []),
  ...sharedFlags(port, profile, viewport),
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

const listening = Effect.fnUntraced(function* listening(
  browser: BrowserChoice,
  flags: readonly string[],
  port: number,
  profile: string
) {
  const processes = yield* ToolProcesses;
  yield* processes.run("open", [
    "-g",
    "-n",
    "-a",
    browser.app,
    "--args",
    ...flags,
  ]);
  const pid = yield* awaitListener(port);
  const command = yield* processes.commandOf(pid);
  if (!command.includes(profileFlag(profile))) {
    return yield* new BrowserError({
      browser: browser.name,
      message: `Port ${port} is held by pid ${pid}, not the browser this run started.`,
      operation: "listen",
      port,
    });
  }
  return pid;
});

export const startInBackground = (
  browser: BrowserChoice,
  flags: readonly string[],
  port: number,
  profile: string
) =>
  listening(browser, flags, port, profile).pipe(
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
  browser: BrowserChoice,
  flags: readonly string[],
  port: number,
  profile: string
) =>
  Effect.acquireRelease(
    startInBackground(browser, flags, port, profile),
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
  browser: BrowserChoice = browsers.chrome
) {
  if (yield* portAnswers(port)) {
    return yield* new BrowserError({
      browser: browser.name,
      message: `Port ${port} already answers; pick another with --port.`,
      operation: "launch",
      port,
    });
  }
  const profile = yield* temporaryProfile;
  const flags = chromeFlags(port, profile, viewport, browser);
  if (browser.headless) {
    const processes = yield* ToolProcesses;
    yield* processes.spawnScoped(browser.binary, flags);
  } else {
    yield* launchWindowed(browser, flags, port, profile);
  }
  return yield* connect(yield* pageSocket(port));
});
