import { parseArgs } from "node:util";

import { ToolProcesses } from "@racer/devtools/process";
import { UsageError } from "@racer/devtools/usage-error";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { linksOf, NETWORK_NAMES } from "./fight-links.ts";
import type { Link, RunName } from "./fight-links.ts";
import {
  FIGHT_PILOT,
  FIGHT_PROBE,
  POSITIONS,
  TAKE_FRAMES,
} from "./fight-probe.ts";
import {
  fightRow,
  positions,
  riderTrack,
  takenFrames,
} from "./fight-report.ts";
import type {
  FightKind,
  FightRow,
  Positions,
  TakenFrames,
} from "./fight-report.ts";

const usage =
  "Usage: pnpm rooms:fights --out <dir> (--rooms-port <port> [--links direct,home,mobile,far,bursts,upload] | --server <game url>) [--slots 1,2]";

const RV = "tools/verify/rushline.ts";
const SEATED_OR_NAMING =
  "!!document.querySelector('input') || [...document.querySelectorAll('button')].some((b) => /^Ready/.test(b.textContent.trim()))";
const SEATED =
  "[...document.querySelectorAll('button')].some((b) => /^Ready/.test(b.textContent.trim()))";
const BENCH_REFUSAL = "while a bench is measuring";
const SEAT_PORTS = [1443, 1444] as const;
const RACE_SPEED = 25;
const ALIGN_WAIT_MS = 250;
const NEAREST_ACROSS = 1.2;
const FARTHEST_ACROSS = 2;
const ALIGNED_ALONG = 1.2;
const MOST_ALIGN_TRIES = 60;
const CAST_SECONDS = 2;
const SHEET_EVERY = 3;
const KICKS_TO_KNOCK_DOWN = 4;
const KICK_COOLDOWN_MS = 1000;
const DISARM = "(globalThis.__fightPilot.armed = null)";
const MOST_STRIKE_TRIES = 3;
const ARM_KICK = `(globalThis.__fightPilot.armed = "KeyK")`;
const LINK_START_MS = 700;

const decodeNetworks = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Literals(NETWORK_NAMES))
);

class FightCheckFailed extends Data.TaggedError("FightCheckFailed")<{
  readonly message: string;
}> {}

type Windows = readonly [string, string];

const CODE_OF = {
  kick: "KeyK",
  punch: "KeyJ",
} as const satisfies Record<FightKind, string>;

interface Bout {
  readonly attacker: 0 | 1;
  readonly kind: FightKind;
}

const BOUTS: readonly Bout[] = [
  { attacker: 0, kind: "punch" },
  { attacker: 1, kind: "punch" },
  { attacker: 0, kind: "kick" },
  { attacker: 1, kind: "kick" },
];

const lastLine = (text: string): string => text.trim().split("\n").at(-1) ?? "";

const rv = Effect.fn("rooms.fights.rv")(function* rv(
  args: readonly string[],
  env?: NodeJS.ProcessEnv
) {
  const processes = yield* ToolProcesses;
  const { stdout } = yield* processes
    .run("node", [RV, ...args], env ? { env: { ...process.env, ...env } } : {})
    .pipe(
      Effect.retry({
        schedule: Schedule.spaced("5 seconds"),
        while: (error) => error.message.includes(BENCH_REFUSAL),
      })
    );
  return stdout.trim();
});

const decodePositions = Schema.decodeUnknownEffect(
  Schema.fromJsonString(positions)
);
const decodeTaken = Schema.decodeUnknownEffect(
  Schema.fromJsonString(takenFrames)
);

const readPositions = (windowRun: string) =>
  rv(["js", "--run", windowRun, POSITIONS]).pipe(
    Effect.flatMap((text) => decodePositions(lastLine(text)))
  );

const readTaken = (windowRun: string, since: number) =>
  rv(["js", "--run", windowRun, TAKE_FRAMES(since)]).pipe(
    Effect.flatMap((text) => decodeTaken(lastLine(text)))
  );

const startLink = (port: number, target: number, link: Link) =>
  Effect.gen(function* startOneLink() {
    const processes = yield* ToolProcesses;
    yield* processes.spawnScoped(
      "node",
      [
        "tools/rooms/lag.ts",
        "--listen",
        String(port),
        "--target",
        String(target),
        "--rtt",
        String(link.rttMs),
        "--jitter",
        String(link.jitterMs),
        "--loss",
        String(link.lossPercent),
        "--burst-every",
        String(link.burstEveryMs / 1000),
        "--burst-ms",
        String(link.burstMs),
        "--upload-ms",
        String(link.uploadMs),
        "--upload-after",
        String(link.uploadAfterMs / 1000),
      ],
      process.env
    );
  });

const seat = (windowRun: string, name: string) =>
  Effect.gen(function* seatRider() {
    yield* rv([
      "wait",
      "--run",
      windowRun,
      "[...document.querySelectorAll('button')].some((b) => /Join/.test(b.textContent))",
      "--timeout",
      "90",
    ]);
    yield* rv(["click", "--run", windowRun, "Join"]);
    yield* rv([
      "wait",
      "--run",
      windowRun,
      SEATED_OR_NAMING,
      "--timeout",
      "20",
    ]);
    const naming = yield* rv([
      "js",
      "--run",
      windowRun,
      "!!document.querySelector('input')",
    ]);
    if (lastLine(naming) !== "true") {
      return;
    }
    yield* rv([
      "js",
      "--run",
      windowRun,
      `(() => { const i = document.querySelector("input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "${name}"); i.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`,
    ]);
    const notice = yield* rv([
      "js",
      "--run",
      windowRun,
      "document.body.innerText.includes('GOT IT')",
    ]);
    if (lastLine(notice) === "true") {
      yield* rv(["click", "--run", windowRun, "Got it"]);
    }
    yield* rv(["click", "--run", windowRun, "Ride"]);
    yield* rv(["wait", "--run", windowRun, SEATED, "--timeout", "90"]);
  });

const quietRoad = (host: string) =>
  Effect.gen(function* quiet() {
    yield* rv(["click", "--run", host, "You set the rules"]);
    yield* rv(["click", "--run", host, "Light"]);
    yield* rv(["click", "--run", host, "None"]);
  });

const startRace = (windows: Windows) =>
  Effect.gen(function* start() {
    yield* Effect.sleep("3 seconds");
    yield* Effect.all(
      windows.map((windowRun) => rv(["click", "--run", windowRun, "Ready"])),
      { concurrency: "unbounded" }
    );
    yield* Effect.all(
      windows.map((windowRun) =>
        rv([
          "wait",
          "--run",
          windowRun,
          "!!globalThis.__rushlineRoom && !!globalThis.__rushlineCast && __rushlineRoom.client.confirmed.tick > 240",
          "--timeout",
          "90",
        ])
      ),
      { concurrency: "unbounded" }
    );
    yield* Effect.all(
      windows.map((windowRun) =>
        Effect.andThen(
          rv(["js", "--run", windowRun, FIGHT_PROBE]),
          rv(["js", "--run", windowRun, FIGHT_PILOT])
        )
      ),
      { concurrency: "unbounded" }
    );
  });

const alongside = (now: Positions): boolean =>
  Math.abs(now.bX - now.aX) >= NEAREST_ACROSS &&
  Math.abs(now.bX - now.aX) <= FARTHEST_ACROSS &&
  Math.abs(now.bS - now.aS) <= ALIGNED_ALONG &&
  now.aSpeed > RACE_SPEED / 2;

const align = Effect.fn("rooms.fights.align")(function* align(
  windows: Windows
) {
  for (let tries = 0; tries < MOST_ALIGN_TRIES; tries += 1) {
    const now = yield* readPositions(windows[0]);
    yield* Console.error(
      `align ${tries}: across ${(now.bX - now.aX).toFixed(2)} along ${(now.bS - now.aS).toFixed(2)} speeds ${now.aSpeed.toFixed(0)} ${now.bSpeed.toFixed(0)} modes ${now.aMode} ${now.bMode} tick ${now.tick}`
    );
    if (alongside(now)) {
      return now;
    }
    if (now.aMode === "wrecked" || now.bMode === "wrecked") {
      return yield* new FightCheckFailed({
        message: `Rider ${now.aMode === "wrecked" ? "A" : "B"} is wrecked, so this race can't bring the riders alongside again.`,
      });
    }
    yield* Effect.sleep(`${ALIGN_WAIT_MS} millis`);
  }
  return yield* new FightCheckFailed({
    message: "The riders never came alongside each other.",
  });
});

const sheetOf = Effect.fn("rooms.fights.sheet")(function* sheetOf(
  folder: string,
  sheet: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const processes = yield* ToolProcesses;
  const names = yield* fs.readDirectory(folder);
  const files = names
    .filter((file) => /\.(?:jpe?g|png)$/u.test(file))
    .toSorted()
    .filter((_, index) => index % SHEET_EVERY === 0)
    .map((file) => path.join(folder, file));
  const cropped = path.join(folder, "crop-%03d.png");
  yield* processes.run("magick", [
    ...files,
    "-gravity",
    "center",
    "-crop",
    "50%x55%+0+0",
    "+repage",
    cropped,
  ]);
  const crops = (yield* fs.readDirectory(folder))
    .filter((file) => file.startsWith("crop-"))
    .toSorted()
    .map((file) => path.join(folder, file));
  yield* processes.run("montage", [
    ...crops,
    "-tile",
    "6x",
    "-geometry",
    "480x+2+2",
    "-quality",
    "70",
    sheet,
  ]);
  yield* fs.remove(folder, { recursive: true });
});

interface Places {
  readonly out: string;
  readonly verifyRoot: string;
}

interface BoutRow extends FightRow {
  readonly fired: boolean;
  readonly gapAcross: number;
  readonly pressed: boolean;
}

const strikeOnce = Effect.fn("rooms.fights.strike")(function* strikeOnce(
  windows: Windows,
  { attacker, kind }: Bout,
  places: Places,
  network: RunName
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const victim = attacker === 0 ? 1 : 0;
  const attackerWindow = windows[attacker];
  const victimWindow = windows[victim];
  const before = yield* align(windows);
  const since = Date.now();
  const name = `${network}-${kind}-${attacker}on${victim}-victim`;
  const cast = yield* Effect.forkChild(
    rv([
      "screencast",
      "--run",
      victimWindow,
      name,
      "--seconds",
      String(CAST_SECONDS),
    ])
  );
  yield* Effect.sleep("200 millis");
  yield* rv([
    "js",
    "--run",
    attackerWindow,
    `(globalThis.__fightPilot.armed = "${CODE_OF[kind]}")`,
  ]);
  yield* Fiber.join(cast);
  yield* rv(["js", "--run", attackerWindow, DISARM]);
  yield* sheetOf(
    path.join(places.verifyRoot, victimWindow, name),
    path.join(places.out, `${name}.jpg`)
  );
  const fromAttacker = yield* readTaken(attackerWindow, since);
  const fromVictim = yield* readTaken(victimWindow, since);
  yield* fs.writeFileString(
    path.join(places.out, `${name}.json`),
    JSON.stringify(fromVictim.frames)
  );
  const pressAt = fromAttacker.presses.find(
    (one) => one.code === CODE_OF[kind]
  )?.at;
  const roomRan = fromVictim.attacks.some(
    (one) => one.rider === attacker && one.attack === kind
  );
  const row: BoutRow = {
    ...fightRow(
      kind,
      attacker,
      victim,
      pressAt ?? since,
      fromAttacker,
      fromVictim
    ),
    fired: pressAt !== undefined && roomRan,
    gapAcross: Math.abs(before.bX - before.aX),
    pressed: pressAt !== undefined,
  };
  return row;
});

const NOTHING_TAKEN: TakenFrames = {
  attacks: [],
  falls: [],
  frames: [],
  hits: [],
  lostButtons: [],
  placed: [],
  presses: [],
  sends: [],
};

const neverAlongside = ({ attacker, kind }: Bout): BoutRow => ({
  ...fightRow(
    kind,
    attacker,
    attacker === 0 ? 1 : 0,
    0,
    NOTHING_TAKEN,
    NOTHING_TAKEN
  ),
  fired: false,
  gapAcross: 0,
  pressed: false,
});

const fightOnce = Effect.fn("rooms.fights.bout")(function* fightOnce(
  windows: Windows,
  bout: Bout,
  places: Places,
  network: RunName
) {
  const once = strikeOnce(windows, bout, places, network).pipe(
    Effect.catchTag("FightCheckFailed", ({ message }) =>
      Console.error(message).pipe(Effect.as(neverAlongside(bout)))
    )
  );
  let row = yield* once;
  for (let retry = 1; retry < MOST_STRIKE_TRIES && !row.fired; retry += 1) {
    row = yield* once;
  }
  return row;
});

const modesOf = (taken: TakenFrames, rider: number): readonly string[] => [
  ...new Set(taken.frames.map((frame) => frame.predicted[rider]?.mode ?? "")),
];

const knockDown = Effect.fn("rooms.fights.knockDown")(function* knockDown(
  windows: Windows
) {
  const since = Date.now();
  for (let kick = 0; kick < KICKS_TO_KNOCK_DOWN; kick += 1) {
    yield* align(windows);
    yield* rv(["js", "--run", windows[0], ARM_KICK]);
    yield* Effect.sleep(`${KICK_COOLDOWN_MS} millis`);
  }
  const seen = yield* readTaken(windows[0], since);
  const felt = yield* readTaken(windows[1], since);
  return {
    attackerSaw: modesOf(seen, 1),
    victimSaw: modesOf(felt, 1),
  };
});

const verdictOf = (row: BoutRow): string => {
  if (!row.pressed) {
    return "not in reach";
  }
  if (!row.fired) {
    return "room ran no strike";
  }
  return row.passed ? "pass" : "FAIL";
};

const msOf = (value: number | null): number | string =>
  value === null ? "n/a" : Math.round(value);

const tableOf = (
  network: RunName,
  rows: readonly BoutRow[]
): readonly string[] =>
  rows.map((row) =>
    [
      network,
      `${row.kind} ${row.attacker} on ${row.victim}`,
      verdictOf(row),
      row.hitLanded
        ? `hit, ${Math.round(row.staminaLost)} stamina, ${row.flinchFrames} flinch frames`
        : "miss",
      row.lead ?? "n/a",
      msOf(row.rttAtPressMs),
      msOf(row.pressToSendMs),
      msOf(row.sendToVictimMs),
      msOf(row.holdMs),
      msOf(row.victimConfirmToDrawnMs),
      msOf(row.pressToStrikeOutMs),
      msOf(row.strikeOutBeforeShoveMs),
      msOf(row.strikeOutBeforeFlinchMs),
      row.drawnErrorAtHitMetres === null
        ? "n/a"
        : row.drawnErrorAtHitMetres.toFixed(2),
      row.lostPresses,
    ].join(" | ")
  );

const TABLE_HEAD = [
  "| Network | Action | Result | What landed | Lead (ticks) | Round trip at the press (ms) | Press to send (ms) | Send to the victim's confirm (ms) | Room hold (ms) | Victim's confirm to the strike drawn (ms) | Press to the strike out (ms) | Strike out before the shove (ms) | Strike out before the flinch (ms) | Attacker drawn off the room's place at the hit (m) | Presses the room dropped |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
].join("\n");

const roomName = (): string => crypto.randomUUID().slice(0, 8);

type Target =
  | { readonly kind: "local"; readonly roomsPort: number }
  | { readonly kind: "server"; readonly url: string };

const linksUp = (target: Target, network: RunName) =>
  Effect.gen(function* bothLinks() {
    if (target.kind === "server" || network === "live") {
      return;
    }
    const [first, second] = linksOf(network);
    yield* startLink(SEAT_PORTS[0], target.roomsPort, first);
    yield* startLink(SEAT_PORTS[1], target.roomsPort, second);
    yield* Effect.sleep(`${LINK_START_MS} millis`);
  });

const runNetwork = (
  windows: Windows,
  network: RunName,
  target: Target,
  places: Places
) =>
  Effect.scoped(
    Effect.gen(function* oneNetwork() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const startedAt = Date.now();
      yield* linksUp(target, network);
      const room = roomName();
      yield* Effect.all(
        windows.map((windowRun) =>
          rv(["open", "--run", windowRun, `/?room=${room}`])
        ),
        { concurrency: "unbounded" }
      );
      yield* seat(windows[0], "One");
      yield* quietRoad(windows[0]);
      yield* seat(windows[1], "Two");
      yield* startRace(windows);
      const rows: BoutRow[] = [];
      for (const bout of BOUTS) {
        rows.push(yield* fightOnce(windows, bout, places, network));
        yield* fs.writeFileString(
          path.join(places.out, `${network}-rows.json`),
          JSON.stringify(rows, null, 2)
        );
      }
      const fall = yield* knockDown(windows).pipe(
        Effect.catchTag("FightCheckFailed", () => Effect.succeed(null))
      );
      const fromOne = yield* readTaken(windows[0], startedAt);
      const taken = yield* readTaken(windows[1], startedAt);
      const report = {
        fall,
        falls: taken.falls,
        network,
        rows,
        rtt: taken.frames.at(-1)?.rtt ?? 0,
        tracks: [riderTrack(fromOne, 1), riderTrack(taken, 0)],
      };
      yield* fs.writeFileString(
        path.join(places.out, `${network}.json`),
        JSON.stringify(report, null, 2)
      );
      yield* Console.log(
        JSON.stringify({ fall, network, rows, tracks: report.tracks })
      );
      return tableOf(network, rows);
    })
  );

const runOf = (text: string): string =>
  text
    .split("\n")
    .find((line) => line.startsWith("RUN="))
    ?.slice("RUN=".length) ?? "";

const windowUp = (slot: string, port: number, target: Target) =>
  Effect.acquireRelease(
    (target.kind === "server"
      ? rv(["up", "--server", target.url, "--user-asked", "--slot", slot])
      : rv(["up", "--dev", "--slot", slot], {
          VITE_ROOMS_URL: `http://127.0.0.1:${port}`,
        })
    ).pipe(Effect.map(runOf)),
    (windowRun) =>
      rv(["down", "--run", windowRun]).pipe(
        Effect.catchTag("ProcessError", (failure) =>
          Console.error(`Could not close ${windowRun}: ${failure.message}`)
        )
      )
  );

export const main = Effect.fn("rooms.fights")(function* main(
  args: readonly string[]
) {
  const { values } = yield* Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          links: { default: NETWORK_NAMES.join(","), type: "string" },
          out: { type: "string" },
          "rooms-port": { type: "string" },
          server: { type: "string" },
          slots: { default: "1,2", type: "string" },
        },
      }),
  });
  const roomsPort = Number(values["rooms-port"]);
  const out = values.out ?? "";
  const target: Target =
    values.server === undefined
      ? { kind: "local", roomsPort }
      : { kind: "server", url: values.server };
  const networks = yield* decodeNetworks(values.links.split(",")).pipe(
    Effect.mapError(
      (cause) => new UsageError({ message: `${cause.message}\n${usage}` })
    )
  );
  if ((target.kind === "local" && !roomsPort) || !out) {
    return yield* new UsageError({ message: usage });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const processes = yield* ToolProcesses;
  yield* fs.makeDirectory(out, { recursive: true });
  const common = yield* processes.run("git", [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const places = {
    out,
    verifyRoot: path.join(
      common.stdout.trim(),
      "..",
      "tools/perf/results/verify"
    ),
  };
  const [firstSlot = "1", secondSlot = "2"] = values.slots.split(",");
  const tables = yield* Effect.scoped(
    Effect.gen(function* raceWindows() {
      const windows: Windows = [
        yield* windowUp(firstSlot, SEAT_PORTS[0], target),
        yield* windowUp(secondSlot, SEAT_PORTS[1], target),
      ];
      return yield* Effect.all(
        (target.kind === "server" ? ["live" as const] : networks).map(
          (network) => runNetwork(windows, network, target, places)
        )
      );
    })
  );
  const lines = tables.flat().map((row) => `| ${row} |`);
  yield* fs.writeFileString(
    path.join(out, "table.md"),
    `${TABLE_HEAD}\n${lines.join("\n")}\n`
  );
  return lines.length;
});
