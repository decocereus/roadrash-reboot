import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CurrentHost } from "./browser-host.ts";
import type { BrowserHost, DesktopEnv } from "./browser-host.ts";
import { toolStateDir, underClaim } from "./claim.ts";
import { released } from "./cleanup.ts";
import { DesktopError } from "./desktop-error.ts";
import { ToolProcesses, alive } from "./process.ts";
import type { ListedProcess } from "./process.ts";

const COMPOSITOR = "Hyprland";
const CONFIG_NAME = "rushline-desktop.conf";
const CONFIG = path.join(import.meta.dirname, CONFIG_NAME);
const DISPLAY_FILE_ENV = "RUSHLINE_DESKTOP_DISPLAY_FILE";
const POLL_MS = 200;
const READY_ATTEMPTS = 150;
const LOG_TAIL_LINES = 12;

const desktopHold = Schema.Struct({
  holder: Schema.String,
  pid: Schema.NullOr(Schema.Number),
});

const desktopClaim = Schema.Struct({
  display: Schema.String,
  holds: Schema.Array(desktopHold),
  instance: Schema.String,
  pid: Schema.Number,
});

export type DesktopClaim = typeof desktopClaim.Type;

type DesktopHold = typeof desktopHold.Type;

export type DesktopState =
  | { readonly kind: "none" }
  | { readonly claim: DesktopClaim; readonly kind: "owned" }
  | { readonly kind: "orphan"; readonly pid: number }
  | {
      readonly display: string;
      readonly kind: "foreign";
      readonly pid: number;
    }
  | { readonly kind: "no-display"; readonly pid: number };

export type DesktopRelease =
  | { readonly kind: "no-session" }
  | { readonly kind: "foreign"; readonly pid: number }
  | {
      readonly claim: DesktopClaim;
      readonly kind: "keep";
      readonly others: readonly string[];
    }
  | { readonly kind: "stop"; readonly pid: number };

const decodeClaim = Schema.decodeUnknownOption(
  Schema.fromJsonString(desktopClaim)
);

const decodeInstances = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(Schema.Struct({ instance: Schema.String, pid: Schema.Number }))
  )
);

const xwaylandLine = /^(?:\S*\/)?Xwayland (?<display>:\d+)(?:\s|$)/u;

const executableOf = (command: string): string =>
  path.basename(command.split(/\s/u, 1)[0] ?? "");

export const desktopStateOf = (
  claim: DesktopClaim | null,
  listed: readonly ListedProcess[]
): DesktopState => {
  const compositors = listed.filter(
    ({ command }) =>
      executableOf(command).toLowerCase() === COMPOSITOR.toLowerCase()
  );
  const ours = compositors.filter(({ command }) =>
    command.includes(CONFIG_NAME)
  );
  if (claim !== null && ours.some((each) => each.pid === claim.pid)) {
    return { claim, kind: "owned" };
  }
  const [orphan] = ours;
  if (orphan !== undefined) {
    return { kind: "orphan", pid: orphan.pid };
  }
  const [foreign] = listed.flatMap(({ command, pid }) => {
    const display = xwaylandLine.exec(command)?.groups?.display;
    return display === undefined ? [] : [{ display, pid }];
  });
  if (foreign !== undefined) {
    return { display: foreign.display, kind: "foreign", pid: foreign.pid };
  }
  const [displayless] = compositors;
  return displayless === undefined
    ? { kind: "none" }
    : { kind: "no-display", pid: displayless.pid };
};

export const desktopCarriesBrowser = (state: DesktopState): boolean => {
  switch (state.kind) {
    case "owned":
    case "foreign": {
      return true;
    }
    case "none":
    case "orphan":
    case "no-display": {
      return false;
    }
    default: {
      return state satisfies never;
    }
  }
};

const holdIsLive = ({ pid }: DesktopHold): boolean =>
  pid === null || alive(pid);

export const desktopReleaseOf = (
  state: DesktopState,
  holder: string,
  isLive: (hold: DesktopHold) => boolean = holdIsLive
): DesktopRelease => {
  switch (state.kind) {
    case "none": {
      return { kind: "no-session" };
    }
    case "foreign":
    case "no-display": {
      return { kind: "foreign", pid: state.pid };
    }
    case "orphan": {
      return { kind: "stop", pid: state.pid };
    }
    case "owned": {
      const holds = state.claim.holds.filter(
        (hold) => hold.holder !== holder && isLive(hold)
      );
      return holds.length === 0
        ? { kind: "stop", pid: state.claim.pid }
        : {
            claim: { ...state.claim, holds },
            kind: "keep",
            others: holds.map((hold) => hold.holder),
          };
    }
    default: {
      return state satisfies never;
    }
  }
};

export const withDesktopHold = (
  claim: DesktopClaim,
  holder: string,
  pid: number | null
): DesktopClaim => ({
  ...claim,
  holds: [
    ...claim.holds.filter((hold) => hold.holder !== holder),
    { holder, pid },
  ],
});

const userId = (): number => process.getuid?.() ?? 0;

export const desktopRuntimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${userId()}`,
});

interface DesktopPaths {
  readonly claim: string;
  readonly display: string;
  readonly draft: string;
  readonly lock: string;
  readonly log: string;
}

const pathsIn = (dir: string): DesktopPaths => ({
  claim: path.join(dir, "desktop.json"),
  display: path.join(dir, "desktop.display"),
  draft: path.join(dir, "desktop.json.draft"),
  lock: path.join(dir, "desktop.lock"),
  log: path.join(dir, "desktop.log"),
});

const readClaim = (paths: DesktopPaths) =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(paths.claim)).pipe(
    Effect.map((text) => Option.getOrNull(decodeClaim(text))),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(null))
  );

const writeClaim = Effect.fnUntraced(function* writeClaim(
  paths: DesktopPaths,
  claim: DesktopClaim
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(paths.draft, JSON.stringify(claim, null, 1));
  yield* fs.rename(paths.draft, paths.claim);
});

const readState = Effect.fnUntraced(function* readState(paths: DesktopPaths) {
  const processes = yield* ToolProcesses;
  return desktopStateOf(yield* readClaim(paths), yield* processes.listed);
});

const underLock = <A, E, R>(
  paths: DesktopPaths,
  step: Effect.Effect<A, E, R>
) =>
  underClaim(
    paths.lock,
    "desktop session",
    step,
    (holder) =>
      new DesktopError({
        message: `Pid ${holder.pid} has held the desktop session lock ${paths.lock} for a minute. Find out what it is doing before you take it.`,
        operation: "lock",
      })
  );

const instanceOf = (pid: number) =>
  ToolProcesses.use((processes) =>
    processes.run("hyprctl", ["instances", "-j"], { env: desktopRuntimeEnv() })
  ).pipe(
    Effect.map(({ stdout }) =>
      Option.match(decodeInstances(stdout), {
        onNone: () => null,
        onSome: (instances) =>
          instances.find((each) => each.pid === pid)?.instance ?? null,
      })
    ),
    Effect.catchTag("ProcessError", () => Effect.succeed(null))
  );

const readDisplay = (paths: DesktopPaths) =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(paths.display)).pipe(
    Effect.map((text) => text.trim()),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(""))
  );

const logTail = (paths: DesktopPaths) =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(paths.log)).pipe(
    Effect.map((text) =>
      text.trim().split("\n").slice(-LOG_TAIL_LINES).join("\n")
    ),
    Effect.orElseSucceed(() => "")
  );

const displaySession = Effect.fnUntraced(function* displaySession() {
  const processes = yield* ToolProcesses;
  const uid = userId();
  const { stdout } = yield* processes.run("loginctl", [
    "show-user",
    String(uid),
    "--property=Display",
    "--value",
  ]);
  const session = stdout.trim();
  if (session === "") {
    return yield* new DesktopError({
      message: `Hyprland cannot open the seat: logind has no display session for uid ${uid}. It needs the owner's console login on tty1, which holds seat0. Log in on tty1, then run this again.`,
      operation: "start",
    });
  }
  return session;
});

const awaitReady = Effect.fnUntraced(function* awaitReady(
  paths: DesktopPaths,
  pid: number
) {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    if (!alive(pid)) {
      return yield* new DesktopError({
        message: `Hyprland exited before its session was ready, so it could not open the seat. It needs an active logind seat, such as a console login on tty1, and no other compositor holding the panel. Last lines of ${paths.log}:\n${yield* logTail(paths)}`,
        operation: "start",
      });
    }
    const display = yield* readDisplay(paths);
    const instance = yield* instanceOf(pid);
    if (display !== "" && instance !== null) {
      return { display, instance };
    }
    yield* Effect.sleep(POLL_MS);
  }
  return yield* new DesktopError({
    message: `Hyprland pid ${pid} did not report its Xwayland display within ${(READY_ATTEMPTS * POLL_MS) / 1000} s. Last lines of ${paths.log}:\n${yield* logTail(paths)}`,
    operation: "start",
  });
});

const started = Effect.fnUntraced(function* started(
  paths: DesktopPaths,
  dir: string,
  holder: string,
  holderPid: number | null
) {
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  const session = yield* displaySession();
  yield* fs.remove(paths.claim, { force: true });
  yield* fs.remove(paths.display, { force: true });
  yield* fs.writeFileString(paths.log, "");
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* startCompositor() {
      const pid = yield* processes.startDetached(
        COMPOSITOR,
        ["--config", CONFIG],
        dir,
        paths.log,
        {
          ...desktopRuntimeEnv(),
          [DISPLAY_FILE_ENV]: paths.display,
          XDG_SESSION_ID: session,
        }
      );
      const ready = yield* restore(awaitReady(paths, pid)).pipe(
        Effect.onError(() => released(processes.stopOwned(pid, CONFIG_NAME)))
      );
      const claim: DesktopClaim = {
        ...ready,
        holds: [{ holder, pid: holderPid }],
        pid,
      };
      yield* writeClaim(paths, claim).pipe(
        Effect.onError(() => released(processes.stopOwned(pid, CONFIG_NAME)))
      );
      return claim;
    })
  );
});

type DesktopUse =
  | { readonly display: string; readonly kind: "owned"; readonly pid: number }
  | {
      readonly display: string;
      readonly kind: "foreign";
      readonly pid: number;
    };

const ownedUse = ({ display, pid }: DesktopClaim): DesktopUse => ({
  display,
  kind: "owned",
  pid,
});

export const desktopUp = Effect.fn("desktop.up")(function* desktopUp(
  holder: string,
  holderPid: number | null,
  dir: string = toolStateDir
) {
  const paths = pathsIn(dir);
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  yield* fs.makeDirectory(dir, { recursive: true });
  const step = Effect.gen(function* decide() {
    const state = yield* readState(paths);
    switch (state.kind) {
      case "owned": {
        yield* writeClaim(
          paths,
          withDesktopHold(state.claim, holder, holderPid)
        );
        return ownedUse(state.claim);
      }
      case "orphan": {
        yield* processes.stopOwned(state.pid, CONFIG_NAME);
        return ownedUse(yield* started(paths, dir, holder, holderPid));
      }
      case "no-display": {
        return yield* new DesktopError({
          message: `${COMPOSITOR} pid ${state.pid} is a compositor rv did not start, and it has no Xwayland, so rv cannot use it. Either it is still starting, which takes about 2 s, so run this again, or its config disables Xwayland, so enable it there.`,
          operation: "use",
        });
      }
      case "foreign": {
        yield* fs.remove(paths.claim, { force: true });
        const use: DesktopUse = {
          display: state.display,
          kind: "foreign",
          pid: state.pid,
        };
        return use;
      }
      case "none": {
        return ownedUse(yield* started(paths, dir, holder, holderPid));
      }
      default: {
        return state satisfies never;
      }
    }
  });
  return yield* underLock(paths, step);
});

export const retainDesktop = Effect.fn("desktop.retain")(
  function* retainDesktop(
    holder: string,
    holderPid: number,
    dir: string = toolStateDir
  ) {
    const paths = pathsIn(dir);
    const step = Effect.gen(function* retain() {
      const state = yield* readState(paths);
      if (state.kind === "owned") {
        yield* writeClaim(
          paths,
          withDesktopHold(state.claim, holder, holderPid)
        );
      }
    });
    yield* underLock(paths, step);
  }
);

export const desktopDown = Effect.fn("desktop.down")(function* desktopDown(
  holder: string,
  dir: string = toolStateDir
) {
  const paths = pathsIn(dir);
  const fs = yield* FileSystem.FileSystem;
  const processes = yield* ToolProcesses;
  yield* fs.makeDirectory(dir, { recursive: true });
  const step = Effect.gen(function* decide() {
    const release = desktopReleaseOf(yield* readState(paths), holder);
    switch (release.kind) {
      case "no-session": {
        yield* fs.remove(paths.claim, { force: true });
        return "no desktop session is running";
      }
      case "foreign": {
        return `left alone: pid ${release.pid} belongs to a compositor rv did not start`;
      }
      case "keep": {
        yield* writeClaim(paths, release.claim);
        return `left running for ${release.others.join(", ")}`;
      }
      case "stop": {
        const stopped = yield* processes.stopOwned(release.pid, CONFIG_NAME);
        yield* fs.remove(paths.claim, { force: true });
        yield* fs.remove(paths.display, { force: true });
        yield* fs.remove(paths.log, { force: true });
        return stopped;
      }
      default: {
        return release satisfies never;
      }
    }
  });
  return yield* underLock(paths, step);
});

export const desktopStatus = (dir: string = toolStateDir) => {
  const paths = pathsIn(dir);
  return underLock(paths, readState(paths));
};

export const describeDesktop = (state: DesktopState): string => {
  switch (state.kind) {
    case "none": {
      return "no desktop session is running";
    }
    case "orphan": {
      return `${COMPOSITOR} pid ${state.pid} runs rv's config, but no claim matches it, so the rv that started it died; rv desktop up <name> replaces it and rv desktop down <name> stops it`;
    }
    case "foreign": {
      return `a compositor rv did not start is up: Xwayland pid ${state.pid} on ${state.display}; rv uses it and never stops it`;
    }
    case "no-display": {
      return `a compositor rv did not start is up: ${COMPOSITOR} pid ${state.pid} has no Xwayland, so rv cannot use it: it is still starting, or its config disables Xwayland`;
    }
    case "owned": {
      const holds = state.claim.holds.map((hold) => hold.holder).join(", ");
      return `${COMPOSITOR} pid ${state.claim.pid} on ${state.claim.display}, instance ${state.claim.instance}, held by ${holds === "" ? "nobody" : holds}`;
    }
    default: {
      return state satisfies never;
    }
  }
};

export const desktopEnvFor = Effect.fn("desktop.envFor")(
  function* desktopEnvFor(
    host: BrowserHost,
    holder: string,
    holderPid: number
  ) {
    switch (host.desktop) {
      case "none": {
        const env: DesktopEnv = {};
        return env;
      }
      case "hyprland": {
        const { display } = yield* desktopUp(holder, holderPid);
        const env: DesktopEnv = { DISPLAY: display };
        return env;
      }
      default: {
        return host.desktop satisfies never;
      }
    }
  }
);

export const holdDesktop = (holder: string) =>
  Effect.acquireRelease(
    CurrentHost.use((host) => desktopEnvFor(host, holder, process.pid)),
    () =>
      released(
        CurrentHost.use((host) =>
          host.desktop === "none" ? Effect.void : desktopDown(holder)
        )
      )
  );
