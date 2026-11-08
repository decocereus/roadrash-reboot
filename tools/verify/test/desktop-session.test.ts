import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { CleanupOutcomes } from "@racer/devtools/cleanup";
import {
  desktopCarriesBrowser,
  desktopDown,
  desktopReleaseOf,
  desktopStateOf,
  desktopStatus,
  desktopUp,
  retainDesktop,
  withDesktopHold,
} from "@racer/devtools/desktop";
import type { DesktopClaim, DesktopState } from "@racer/devtools/desktop";
import { ToolProcesses } from "@racer/devtools/process";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vitest";

const CONFIG_COMMAND = "Hyprland --config /x/rushline-desktop.conf";
const OWNED_PID = process.pid;

const claimOf = (pid: number, ...holders: readonly string[]): DesktopClaim => ({
  display: ":7",
  holds: holders.map((holder) => ({ holder, pid: null })),
  instance: "sig",
  pid,
});

describe("desktop session states", () => {
  it("has no session when nothing runs", () => {
    expect(desktopStateOf(null, [])).toStrictEqual({ kind: "none" });
  });

  it("owns a session only while the claimed pid still runs our config", () => {
    const claim = claimOf(50);
    expect(
      desktopStateOf(claim, [{ command: CONFIG_COMMAND, pid: 50 }])
    ).toStrictEqual({ claim, kind: "owned" });
    expect(
      desktopStateOf(claim, [{ command: "vim notes.txt", pid: 50 }])
    ).toStrictEqual({ kind: "none" });
  });

  it("calls our config running with no matching claim an orphan", () => {
    const orphan = { kind: "orphan", pid: 60 };
    const running = { command: CONFIG_COMMAND, pid: 60 };
    expect(desktopStateOf(null, [running])).toStrictEqual(orphan);
    expect(desktopStateOf(claimOf(50), [running])).toStrictEqual(orphan);
    expect(
      desktopStateOf(null, [{ command: `/usr/bin/${CONFIG_COMMAND}`, pid: 60 }])
    ).toStrictEqual(orphan);
  });

  it("never reads an orphan's own Xwayland as a foreign compositor", () => {
    expect(
      desktopStateOf(null, [
        { command: "Xwayland :0 -rootless -core", pid: 61 },
        { command: CONFIG_COMMAND, pid: 60 },
      ])
    ).toStrictEqual({ kind: "orphan", pid: 60 });
  });

  it("calls another Hyprland with no Xwayland a compositor with no display", () => {
    expect(
      desktopStateOf(null, [
        { command: "/usr/bin/Hyprland --config /home/me/hypr.conf", pid: 40 },
      ])
    ).toStrictEqual({ kind: "no-display", pid: 40 });
  });

  it.for(["hyprland", "/usr/bin/hyprland --config /home/me/hypr.conf"])(
    "recognises a compositor started as %s through the lowercase symlink",
    (command) => {
      expect(desktopStateOf(null, [{ command, pid: 40 }])).toStrictEqual({
        kind: "no-display",
        pid: 40,
      });
    }
  );

  it.for([
    "vim rushline-desktop.conf",
    "vim Hyprland",
    "tail -f /run/Hyprland/hyprland.log",
    "/bin/sh -c exec Hyprland --config /x/rushline-desktop.conf",
    "bash -c pgrep -x Hyprland; ps | grep Xwayland",
    "Hyprlandish --config /x/rushline-desktop.conf",
  ])("does not take %s for a compositor", (command) => {
    expect(desktopStateOf(null, [{ command, pid: 70 }])).toStrictEqual({
      kind: "none",
    });
  });

  it("reads a compositor someone else started from its Xwayland", () => {
    expect(
      desktopStateOf(null, [
        { command: "Hyprland", pid: 40 },
        { command: "Xwayland :3 -rootless -core", pid: 41 },
      ])
    ).toStrictEqual({ display: ":3", kind: "foreign", pid: 41 });
  });

  it("does not take a command that merely names Xwayland for a server", () => {
    expect(
      desktopStateOf(null, [{ command: "vim Xwayland :3", pid: 41 }])
    ).toStrictEqual({ kind: "none" });
  });

  it("never offers to stop a foreign compositor", () => {
    expect(
      desktopReleaseOf({ display: ":3", kind: "foreign", pid: 41 }, "run-a")
    ).toStrictEqual({ kind: "foreign", pid: 41 });
  });

  it("never offers to stop a compositor with no display", () => {
    expect(
      desktopReleaseOf({ kind: "no-display", pid: 40 }, "run-a")
    ).toStrictEqual({ kind: "foreign", pid: 40 });
  });

  it("stops an orphan", () => {
    expect(
      desktopReleaseOf({ kind: "orphan", pid: 60 }, "run-a")
    ).toStrictEqual({ kind: "stop", pid: 60 });
  });

  it("carries a browser only on a session with an X display it can trust", () => {
    const states: readonly DesktopState[] = [
      { kind: "none" },
      { claim: claimOf(50), kind: "owned" },
      { kind: "orphan", pid: 60 },
      { display: ":3", kind: "foreign", pid: 41 },
      { kind: "no-display", pid: 40 },
    ];
    expect(states.map(desktopCarriesBrowser)).toStrictEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("keeps the session while another slot holds it and stops on the last", () => {
    const claim = claimOf(50, "run-a", "run-b");
    expect(
      desktopReleaseOf({ claim, kind: "owned" }, "run-a", () => true)
    ).toStrictEqual({
      claim: { ...claim, holds: [{ holder: "run-b", pid: null }] },
      kind: "keep",
      others: ["run-b"],
    });
    expect(
      desktopReleaseOf(
        { claim: claimOf(50, "run-b"), kind: "owned" },
        "run-b",
        () => true
      )
    ).toStrictEqual({ kind: "stop", pid: 50 });
  });

  it("does not count a holder whose process died", () => {
    expect(
      desktopReleaseOf(
        { claim: claimOf(50, "run-a", "crashed"), kind: "owned" },
        "run-a",
        (hold) => hold.holder !== "crashed"
      )
    ).toStrictEqual({ kind: "stop", pid: 50 });
  });

  it("replaces a holder's hold instead of adding a second", () => {
    expect(
      withDesktopHold(claimOf(50, "run-a"), "run-a", 77).holds
    ).toStrictEqual([{ holder: "run-a", pid: 77 }]);
  });
});

const dirs: string[] = [];

const freshDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rushline-desktop-test-"));
  dirs.push(dir);
  return dir;
};

interface Machine {
  readonly commands: Map<number, string>;
  seatSession: string;
  sessionUser: string;
  readonly sessions: (string | undefined)[];
  readonly starts: string[];
  readonly stops: (readonly [number | null, string])[];
  seatOpens: boolean;
}

const machineOf = (): Machine => ({
  commands: new Map(),
  seatOpens: true,
  seatSession: "2",
  sessionUser: String(process.getuid?.() ?? 0),
  sessions: [],
  starts: [],
  stops: [],
});

const stdoutOf = (
  machine: Machine,
  file: string,
  args: readonly string[]
): string => {
  if (file === "hyprctl") {
    return JSON.stringify([{ instance: "sig", pid: OWNED_PID }]);
  }
  const [verb, target, property] = args;
  if (file !== "loginctl") {
    return "";
  }
  if (verb === "show-seat" && target === "seat0") {
    return property === "--property=ActiveSession"
      ? `${machine.seatSession}\n`
      : "";
  }
  if (verb === "show-session" && target === machine.seatSession) {
    return property === "--property=User" ? `${machine.sessionUser}\n` : "";
  }
  return "";
};

const processesOn = (machine: Machine) =>
  Layer.succeed(ToolProcesses)({
    commandOf: (pid) => Effect.succeed(machine.commands.get(pid) ?? ""),
    listed: Effect.sync(() =>
      [...machine.commands].map(([pid, command]) => ({ command, pid }))
    ),
    listenerOf: () => Effect.succeed(null),
    run: (file, args) =>
      Effect.sync(() => ({
        stderr: "",
        stdout: stdoutOf(machine, file, args),
      })),
    runShown: () => Effect.die("nothing here runs a shown command"),
    spawnScoped: () => Effect.die("the desktop session spawns nothing scoped"),
    startDetached: (file, _args, _cwd, _log, env) =>
      Effect.sync(() => {
        machine.starts.push(file);
        machine.sessions.push(env.XDG_SESSION_ID);
        if (machine.seatOpens) {
          machine.commands.set(OWNED_PID, CONFIG_COMMAND);
          writeFileSync(env.RUSHLINE_DESKTOP_DISPLAY_FILE ?? "", ":7");
          return OWNED_PID;
        }
        return 2 ** 30;
      }),
    stopOwned: (pid, expect_) =>
      Effect.sync(() => {
        machine.stops.push([pid, expect_]);
        if (pid !== null) {
          machine.commands.delete(pid);
        }
        return `stopped pid ${pid}`;
      }),
  });

const onMachine = async <A, E>(
  machine: Machine,
  effect: Effect.Effect<
    A,
    E,
    CleanupOutcomes | ToolProcesses | FileSystem.FileSystem | Path.Path
  >
) =>
  await Effect.runPromiseExit(
    Effect.gen(function* withOutcomes() {
      const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
      return yield* effect.pipe(
        Effect.provideService(CleanupOutcomes, outcomes)
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          processesOn(machine),
          NodeFileSystem.layer,
          NodePath.layer
        )
      )
    )
  );

const decodeWrittenClaim = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      display: Schema.String,
      holds: Schema.Array(Schema.Struct({ holder: Schema.String })),
      pid: Schema.Number,
    })
  )
);

const failureText = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.isFailure(exit)
    ? exit.cause.reasons
        .filter(Cause.isFailReason)
        .map((reason) => String(reason.error))
        .join("\n")
    : "";

describe("desktop session lifecycle", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("starts once when two agents race and hands both the same display", async () => {
    const machine = machineOf();
    const dir = freshDir();
    const exit = await onMachine(
      machine,
      Effect.all(
        [desktopUp("run-a", null, dir), desktopUp("run-b", null, dir)],
        { concurrency: "unbounded" }
      )
    );
    expect(machine.starts).toStrictEqual(["Hyprland"]);
    expect(Exit.isSuccess(exit)).toBeTruthy();
    const claim = decodeWrittenClaim(
      readFileSync(path.join(dir, "desktop.json"), "utf-8")
    );
    expect({
      display: claim.display,
      holders: claim.holds.map((hold) => hold.holder).toSorted(),
      pid: claim.pid,
    }).toStrictEqual({
      display: ":7",
      holders: ["run-a", "run-b"],
      pid: OWNED_PID,
    });
    expect(existsSync(path.join(dir, "desktop.lock"))).toBeFalsy();
  });

  it("is idempotent for one holder", async () => {
    const machine = machineOf();
    const dir = freshDir();
    await onMachine(
      machine,
      Effect.all([desktopUp("run-a", null, dir), desktopUp("run-a", null, dir)])
    );
    expect(machine.starts).toStrictEqual(["Hyprland"]);
  });

  it("survives the first holder leaving and stops on the second, by its config", async () => {
    const machine = machineOf();
    const dir = freshDir();
    await onMachine(
      machine,
      Effect.all([desktopUp("run-a", null, dir), desktopUp("run-b", null, dir)])
    );
    const first = await onMachine(machine, desktopDown("run-a", dir));
    expect(first).toStrictEqual(Exit.succeed("left running for run-b"));
    expect(machine.stops).toStrictEqual([]);
    const second = await onMachine(machine, desktopDown("run-b", dir));
    expect(second).toStrictEqual(Exit.succeed(`stopped pid ${OWNED_PID}`));
    expect(machine.stops).toStrictEqual([[OWNED_PID, "rushline-desktop.conf"]]);
    expect(existsSync(path.join(dir, "desktop.json"))).toBeFalsy();
  });

  it("uses a compositor someone else started and never stops it", async () => {
    const machine = machineOf();
    machine.commands.set(41, "Xwayland :3 -rootless");
    const dir = freshDir();
    const up = await onMachine(machine, desktopUp("run-a", null, dir));
    expect(up).toStrictEqual(
      Exit.succeed({ display: ":3", kind: "foreign", pid: 41 })
    );
    expect(machine.starts).toStrictEqual([]);
    const down = await onMachine(machine, desktopDown("run-a", dir));
    expect(down).toStrictEqual(
      Exit.succeed(
        "left alone: pid 41 belongs to a compositor rv did not start"
      )
    );
    expect(machine.stops).toStrictEqual([]);
  });

  it("starts afresh when the claimed pid is no longer our compositor", async () => {
    const machine = machineOf();
    const dir = freshDir();
    writeFileSync(
      path.join(dir, "desktop.json"),
      JSON.stringify(claimOf(99, "crashed"))
    );
    machine.commands.set(99, "vim notes.txt");
    const up = await onMachine(machine, desktopUp("run-a", null, dir));
    expect(up).toStrictEqual(
      Exit.succeed({ display: ":7", kind: "owned", pid: OWNED_PID })
    );
    expect(machine.stops).toStrictEqual([]);
  });

  it("replaces an orphan on up, and starts one session", async () => {
    const machine = machineOf();
    machine.commands.set(60, CONFIG_COMMAND);
    machine.commands.set(61, "Xwayland :0 -rootless -core");
    const dir = freshDir();
    const up = await onMachine(machine, desktopUp("run-a", null, dir));
    expect(machine.stops).toStrictEqual([[60, "rushline-desktop.conf"]]);
    expect(machine.starts).toStrictEqual(["Hyprland"]);
    expect(up).toStrictEqual(
      Exit.succeed({ display: ":7", kind: "owned", pid: OWNED_PID })
    );
  });

  it("keeps the session when one named hold leaves and another remains", async () => {
    const machine = machineOf();
    const dir = freshDir();
    await onMachine(machine, desktopUp("baseline", null, dir));
    await onMachine(machine, desktopUp("bar-look", null, dir));
    const first = await onMachine(machine, desktopDown("bar-look", dir));
    expect(first).toStrictEqual(Exit.succeed("left running for baseline"));
    expect(machine.stops).toStrictEqual([]);
    const last = await onMachine(machine, desktopDown("baseline", dir));
    expect(last).toStrictEqual(Exit.succeed(`stopped pid ${OWNED_PID}`));
  });

  it("stops an orphan on down, and cleans up the session's files", async () => {
    const machine = machineOf();
    machine.commands.set(60, CONFIG_COMMAND);
    const dir = freshDir();
    writeFileSync(path.join(dir, "desktop.display"), ":0");
    writeFileSync(path.join(dir, "desktop.log"), "log");
    const down = await onMachine(machine, desktopDown("rv desktop", dir));
    expect(down).toStrictEqual(Exit.succeed("stopped pid 60"));
    expect(machine.stops).toStrictEqual([[60, "rushline-desktop.conf"]]);
    expect(existsSync(path.join(dir, "desktop.display"))).toBeFalsy();
    expect(existsSync(path.join(dir, "desktop.log"))).toBeFalsy();
  });

  it("waits for a live start before it reads the session", async () => {
    const machine = machineOf();
    machine.commands.set(60, CONFIG_COMMAND);
    const dir = freshDir();
    const lock = path.join(dir, "desktop.lock");
    writeFileSync(
      lock,
      JSON.stringify({ label: "desktop session", pid: process.pid })
    );
    setTimeout(() => {
      writeFileSync(
        path.join(dir, "desktop.json"),
        JSON.stringify(claimOf(60, "run-a"))
      );
      rmSync(lock);
    }, 300);
    const status = await onMachine(machine, desktopStatus(dir));
    expect(status).toStrictEqual(
      Exit.succeed({ claim: claimOf(60, "run-a"), kind: "owned" })
    );
  });

  it("lets an interrupt end a wait for the lock", async () => {
    const dir = freshDir();
    writeFileSync(
      path.join(dir, "desktop.lock"),
      JSON.stringify({ label: "desktop session", pid: process.pid })
    );
    const status = await onMachine(
      machineOf(),
      desktopStatus(dir).pipe(Effect.timeoutOption("100 millis"))
    );
    expect(status).toStrictEqual(Exit.succeed(Option.none()));
  });

  it("fails at once on a compositor with no display, launching nothing", async () => {
    const machine = machineOf();
    machine.commands.set(40, "Hyprland");
    const dir = freshDir();
    const up = await onMachine(machine, desktopUp("run-a", null, dir));
    expect(machine.starts).toStrictEqual([]);
    expect(machine.stops).toStrictEqual([]);
    expect(failureText(up)).toContain("still starting");
    expect(failureText(up)).toContain("disables Xwayland");
  });

  it("leaves a compositor with no display alone on down", async () => {
    const machine = machineOf();
    machine.commands.set(40, "Hyprland");
    const down = await onMachine(machine, desktopDown("run-a", freshDir()));
    expect(down).toStrictEqual(
      Exit.succeed(
        "left alone: pid 40 belongs to a compositor rv did not start"
      )
    );
    expect(machine.stops).toStrictEqual([]);
  });

  it("fails naming the seat when the compositor exits, and leaves no claim", async () => {
    const machine = machineOf();
    machine.seatOpens = false;
    const dir = freshDir();
    const up = await onMachine(machine, desktopUp("run-a", null, dir));
    expect(failureText(up)).toContain("could not open the seat");
    expect(existsSync(path.join(dir, "desktop.json"))).toBeFalsy();
    expect(existsSync(path.join(dir, "desktop.lock"))).toBeFalsy();
  });

  it("opens the seat through the console's display session, not the caller's ssh session", async () => {
    vi.stubEnv("XDG_SESSION_ID", "555");
    const machine = machineOf();
    const up = await onMachine(machine, desktopUp("run-a", null, freshDir()));
    expect(Exit.isSuccess(up)).toBeTruthy();
    expect(machine.sessions).toStrictEqual(["2"]);
  });

  it.for([
    { case: "seat0 has no active session", seatSession: "", sessionUser: "" },
    {
      case: "seat0's active session is another user's",
      seatSession: "2",
      sessionUser: "4242",
    },
  ])(
    "fails naming the tty1 login when $case, launching nothing",
    async ({ seatSession, sessionUser }) => {
      const machine = machineOf();
      machine.seatSession = seatSession;
      machine.sessionUser = sessionUser;
      const dir = freshDir();
      const up = await onMachine(machine, desktopUp("run-a", null, dir));
      expect(machine.starts).toStrictEqual([]);
      expect(failureText(up)).toContain("seat0 has no active session of uid");
      expect(failureText(up)).toContain("console login on tty1");
      expect(existsSync(path.join(dir, "desktop.json"))).toBeFalsy();
      expect(existsSync(path.join(dir, "desktop.lock"))).toBeFalsy();
    }
  );

  it("moves a hold to the browser's pid so a crash frees the session", async () => {
    const machine = machineOf();
    const dir = freshDir();
    await onMachine(
      machine,
      Effect.all([
        desktopUp("run-a", null, dir),
        desktopUp("run-b", null, dir),
        retainDesktop("run-a", 2 ** 30, dir),
      ])
    );
    const down = await onMachine(machine, desktopDown("run-b", dir));
    expect(down).toStrictEqual(Exit.succeed(`stopped pid ${OWNED_PID}`));
  });
});
