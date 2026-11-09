import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import { describe, expect, it } from "vitest";

import { main } from "../src/fight-compare.ts";
import type { RuleId } from "../src/fight-compare.ts";
import type { RunName } from "../src/fight-links.ts";
import type { BoutRow, NetworkReport } from "../src/fight-report.ts";

const strike = (attacker: number, change: Partial<BoutRow> = {}): BoutRow => ({
  attacker,
  drawnErrorAtHitMetres: 0.28,
  drawnFrames: 12,
  fired: true,
  flinchFrames: 6,
  gapAcross: 1.5,
  hitLanded: true,
  holdMs: 12,
  kind: "kick",
  lead: 9,
  lostPresses: 0,
  passed: true,
  pressToLandMs: 320,
  pressToSendMs: 8,
  pressToShownMs: 220,
  pressToStrikeOutMs: 300,
  pressed: true,
  rttAtPressMs: 110,
  sendToVictimMs: 160,
  staminaLost: 22,
  strikeOutBeforeFlinchMs: 16,
  strikeOutBeforeShoveMs: 0,
  victim: attacker === 0 ? 1 : 0,
  victimConfirmToDrawnMs: 40,
  ...change,
});

interface Ride {
  readonly p95: number;
  readonly rows: readonly BoutRow[];
  readonly step: number;
}

const steady: Ride = {
  p95: 0.25,
  rows: [strike(0), strike(1), strike(0), strike(1)],
  step: 0.15,
};

const track = (rider: number, { p95, step }: Ride) => {
  const error = { errorP95Metres: p95, frames: 900, worstStepMetres: step };
  return { drawn: error, guessed: error, rider };
};

const report = (network: RunName, ride: Ride = steady): NetworkReport => ({
  fall: { attackerSaw: ["riding"], victimSaw: ["riding", "crashed"] },
  falls: [],
  network,
  rows: ride.rows,
  rtt: 110,
  tracks: [track(1, ride), track(0, ride)],
});

const everyRow = (change: Partial<BoutRow>): Ride => ({
  ...steady,
  rows: steady.rows.map((row) => ({ ...row, ...change })),
});

const firstRow = (change: Partial<BoutRow>): Ride => ({
  ...steady,
  rows: steady.rows.map((row, index) =>
    index === 0 ? { ...row, ...change } : row
  ),
});

type Build = readonly (readonly NetworkReport[])[];

const OUT = "compare.md";

const compare = async (
  base: Build,
  head: Build,
  written: (json: string) => string = (json) => json
) => {
  const files = new Map<string, string>();
  const listings = new Map<string, string[]>();
  const place = (side: string, build: Build) =>
    build.map((reports, run) => {
      const dir = `${side}-${run}`;
      listings.set(dir, []);
      for (const one of reports) {
        const names = [
          `${one.network}.json`,
          `${one.network}-rows.json`,
          `${one.network}-kick-0on1-victim.json`,
        ];
        listings.get(dir)?.push(...names);
        files.set(`${dir}/${one.network}.json`, written(JSON.stringify(one)));
        files.set(`${dir}/${one.network}-rows.json`, JSON.stringify(one.rows));
        files.set(`${dir}/${one.network}-kick-0on1-victim.json`, "[]");
      }
      return dir;
    });
  const exit = await main([
    "--base",
    place("base", base).join(","),
    "--head",
    place("head", head).join(","),
    "--out",
    OUT,
  ]).pipe(
    Effect.provide(
      FileSystem.layerNoop({
        readDirectory: (path) => Effect.succeed(listings.get(path) ?? []),
        readFileString: (path) => Effect.succeed(files.get(path) ?? ""),
        writeFileString: (path, data) =>
          Effect.sync(() => {
            files.set(path, data);
          }),
      })
    ),
    Effect.exit,
    Effect.runPromise
  );
  const markdown = files.get(OUT) ?? "";
  const verdicts = markdown
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.split(".")[0] ?? "");
  return { exit, markdown, verdicts };
};

const twoRuns = (ride: Ride = steady): Build => [
  [report("home", ride), report("mobile", ride)],
  [report("home", ride), report("mobile", ride)],
];

const regressions = {
  "attacker-off-at-hit": firstRow({ drawnErrorAtHitMetres: 1.3 }),
  "press-to-strike-out": everyRow({ pressToStrikeOutMs: 400 }),
  "presses-dropped": firstRow({ lostPresses: 1 }),
  "rival-drawn-off": { ...steady, p95: 0.5 },
  "rival-snap": { ...steady, step: 3.3 },
  "strikes-failed": firstRow({ passed: false }),
} satisfies Record<RuleId, Ride>;

describe("comparing two builds' fights", () => {
  it("passes two builds that rode alike", async () => {
    const { exit, verdicts } = await compare(twoRuns(), twoRuns());
    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(verdicts).toStrictEqual(["- Head passes all 12 checks"]);
  });

  it.each(Object.entries(regressions))(
    "fails a head that breaks %s, naming the rule on each link",
    async (rule, ride) => {
      const { exit, verdicts } = await compare(twoRuns(), twoRuns(ride));
      expect(Exit.isFailure(exit)).toBeTruthy();
      expect(verdicts).toStrictEqual([
        `- FAIL home ${rule}`,
        `- FAIL mobile ${rule}`,
        "- Head fails 2 of 12 checks",
      ]);
    }
  );

  it("fails a head whose strike the room never ran", async () => {
    const { exit, verdicts } = await compare(
      twoRuns(),
      twoRuns(firstRow({ fired: false, passed: false }))
    );
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(verdicts).toContain("- FAIL home strikes-failed");
  });

  it("fails a head that measured nothing base measured", async () => {
    const { exit, verdicts } = await compare(
      twoRuns(),
      twoRuns(
        everyRow({
          drawnErrorAtHitMetres: null,
          fired: false,
          passed: false,
          pressToStrikeOutMs: null,
          pressed: false,
        })
      )
    );
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(verdicts).toContain("- FAIL home press-to-strike-out");
    expect(verdicts).toContain("- FAIL home attacker-off-at-hit");
  });

  it("calls a limit both builds break a known gap and passes", async () => {
    const gap = firstRow({ drawnErrorAtHitMetres: 2.6 });
    const { exit, verdicts } = await compare(twoRuns(gap), twoRuns(gap));
    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(verdicts).toStrictEqual([
      "- known gap home attacker-off-at-hit",
      "- known gap mobile attacker-off-at-hit",
      "- Head passes all 12 checks",
    ]);
  });

  it("judges a head against the base's worst run, not its best", async () => {
    const spread: Build = [
      [report("home", { ...steady, p95: 0.21 })],
      [report("home", { ...steady, p95: 0.28 })],
    ];
    const { exit } = await compare(spread, [
      [report("home", { ...steady, p95: 0.44 })],
    ]);
    expect(Exit.isSuccess(exit)).toBeTruthy();
  });

  it("reads a bound only some head runs break as mixed, shows every run and passes", async () => {
    const drifting = { ...steady, p95: 0.5 };
    const { exit, markdown, verdicts } = await compare(twoRuns(), [
      [report("home"), report("mobile")],
      [report("home", drifting), report("mobile", drifting)],
    ]);
    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(verdicts).toStrictEqual([
      "- mixed home rival-drawn-off",
      "- mixed mobile rival-drawn-off",
      "- Head passes all 12 checks, with 2 mixed",
    ]);
    expect(markdown).toContain(
      "| Rival drawn off the room's place, worst p95 in a run | 0.25 m | 0.25 m | 0.25 m | 0.50 m | 0.41 m, base's worst run plus 25% and 0.10 m | mixed |"
    );
  });

  it("reports and fails a link only one build ran", async () => {
    const { exit, markdown, verdicts } = await compare(twoRuns(), [
      [report("home")],
      [report("home")],
    ]);
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(markdown).toContain(
      "Only base ran this link (2 runs), so nothing on it is judged."
    );
    expect(verdicts).toStrictEqual([
      "- FAIL mobile link-on-both",
      "- Head fails 1 of 7 checks",
    ]);
  });

  it("refuses a report whose measure is not a finite number", async () => {
    const { exit, verdicts } = await compare(
      [[report("home", { ...steady, p95: 4242 })]],
      [[report("home", { ...steady, p95: 100 })]],
      (json) => json.replaceAll("4242", "1e309")
    );
    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(verdicts).toStrictEqual([]);
  });

  it("refuses a folder with no fights report", async () => {
    const { exit } = await compare(twoRuns(), [[]]);
    expect(Exit.isFailure(exit)).toBeTruthy();
  });
});
