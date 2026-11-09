import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import { BIKE_HALF_WIDTH, TICK_SECONDS } from "@racer/sim/state";
import { weapons } from "@racer/sim/weapons";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { RUN_NAMES } from "./fight-links.ts";
import type { RunName } from "./fight-links.ts";
import { NetworkReportSchema, strikeVerdict } from "./fight-report.ts";
import type { BoutRow, NetworkReport } from "./fight-report.ts";

const USAGE =
  "Usage: pnpm rooms:compare --base <dir>[,<dir>...] --head <dir>[,<dir>...] [--out <file.md>]";

const REPORT_FILE = /^[a-z]+\.json$/u;
const MS_PER_SECOND = 1000;
const PERCENT = 100;

class FightCompareFailed extends Data.TaggedError("FightCompareFailed")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const failed = (message: string) => (cause: unknown) =>
  new FightCompareFailed({ cause, message });

const decodeReport = Schema.decodeUnknownEffect(
  Schema.fromJsonString(NetworkReportSchema)
);

const worstOf = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.max(...values);

const medianOf = (values: readonly number[]): number | null => {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) {
    return null;
  }
  return sorted.length % 2 === 1
    ? upper
    : ((sorted[middle - 1] ?? upper) + upper) / 2;
};

const UNITS = {
  count: String,
  metres: (value: number) => `${value.toFixed(2)} m`,
  ms: (value: number) => `${Math.round(value)} ms`,
} as const;

type Unit = keyof typeof UNITS;

interface RuleBase {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly measured: string;
  readonly perRun: (run: NetworkReport) => number | null;
  readonly unit: Unit;
}

interface LimitRule extends RuleBase {
  readonly ceiling: number;
  readonly kind: "limit";
}

interface NoWorseRule extends RuleBase {
  readonly kind: "noWorse";
  readonly share: number;
  readonly slack: number;
}

type CompareRule = LimitRule | NoWorseRule;

const failedStrike = (row: BoutRow): boolean => {
  const verdict = strikeVerdict(row);
  return verdict === "FAIL" || verdict === "room ran no strike";
};

const worstDrawn =
  (pick: (track: NetworkReport["tracks"][number]["drawn"]) => number) =>
  (run: NetworkReport): number | null =>
    worstOf(
      run.tracks.flatMap(({ drawn }) => (drawn.frames > 0 ? [pick(drawn)] : []))
    );

const rowValues = (
  run: NetworkReport,
  pick: (row: BoutRow) => number | null
): readonly number[] =>
  run.rows.flatMap((row) => {
    const value = pick(row);
    return value === null ? [] : [value];
  });

const RULES = [
  {
    ceiling: 0,
    description:
      "Every strike a rider presses plays on the other rider's screen, drawn fully out before the shove and the flinch.",
    id: "strikes-failed",
    kind: "limit",
    label: "Strikes that failed in a run",
    measured:
      "On 2026-11-09 and 2026-11-10 no strike failed in 30 link runs of main's netcode over home, mobile and bursts.",
    perRun: (run) => run.rows.filter(failedStrike).length,
    unit: "count",
  },
  {
    description: "The room rides every button press a rider makes.",
    id: "presses-dropped",
    kind: "noWorse",
    label: "Presses the room dropped in a run",
    measured:
      "On 2026-11-09 and 2026-11-10 main's netcode dropped 2 to 5 presses, all in one strike, in 3 of 12 runs on mobile and 2 of 6 on bursts, and none in 12 runs on home.",
    perRun: (run) =>
      run.rows.reduce((total, row) => total + row.lostPresses, 0),
    share: 0,
    slack: 0,
    unit: "count",
  },
  {
    description:
      "The rival is drawn where the room had them, judged by the 95th percentile of the sideways gap over every drawn frame.",
    id: "rival-drawn-off",
    kind: "noWorse",
    label: "Rival drawn off the room's place, worst p95 in a run",
    measured:
      "On 2026-11-09 and 2026-11-10 twelve runs of main's netcode read 0.24 to 0.29 m on home and 1.04 to 1.37 m on mobile, and six read 1.51 to 3.92 m on bursts.",
    perRun: worstDrawn((track) => track.errorP95Metres),
    share: 0.25,
    slack: 0.1,
    unit: "metres",
  },
  {
    ceiling: 2 * BIKE_HALF_WIDTH,
    description:
      "The rival never jumps sideways more than a bike's width between two frames. Steering and a kick's shove move a bike under 0.2 m a frame, so a bigger jump is a snap the player sees.",
    id: "rival-snap",
    kind: "limit",
    label: "Rival's biggest sideways jump between frames in a run",
    measured:
      "On 2026-11-09 and 2026-11-10 main's netcode moved at most 0.11 to 0.26 m in 12 runs on home, snapped 3.07 to 4.11 m in 10 of 12 runs on mobile and 3.86 to 12.39 m in all 6 on bursts.",
    perRun: worstDrawn((track) => track.worstStepMetres),
    unit: "metres",
  },
  {
    ceiling: weapons.none.reachX / 2,
    description:
      "When a hit lands, the victim sees the attacker within half a bare-hand reach of where the room had them, so no hit lands from a bike drawn out of reach.",
    id: "attacker-off-at-hit",
    kind: "limit",
    label: "Attacker drawn off the room's place at a hit, worst in a run",
    measured:
      "On 2026-11-09 and 2026-11-10 twelve runs of main's netcode read 0.01 to 0.51 m on home and 0.13 to 1.77 m on mobile, over the limit in 2, and six read 0.40 to 4.49 m on bursts, over it in 4.",
    perRun: (run) =>
      worstOf(rowValues(run, (row) => row.drawnErrorAtHitMetres)),
    unit: "metres",
  },
  {
    description:
      "A strike reaches full extension on the victim's screen no later after the press than it did before.",
    id: "press-to-strike-out",
    kind: "noWorse",
    label: "Press to the strike drawn fully out, median in a run",
    measured:
      "On 2026-11-09 and 2026-11-10 the median of a run of main's netcode read 209 to 227 ms on home and 387 to 539 ms on mobile in twelve runs, and 337 to 752 ms on bursts in six.",
    perRun: (run) => medianOf(rowValues(run, (row) => row.pressToStrikeOutMs)),
    share: 0.15,
    slack: TICK_SECONDS * MS_PER_SECOND,
    unit: "ms",
  },
] as const satisfies readonly CompareRule[];

export type RuleId = (typeof RULES)[number]["id"];

const OUTCOMES = ["pass", "FAIL", "mixed", "known gap", "not judged"] as const;

type Outcome = (typeof OUTCOMES)[number];

interface Judged {
  readonly bound: number | null;
  readonly note: string;
  readonly outcome: Outcome;
}

const boundOf = (rule: CompareRule, baseWorst: number | null) => {
  switch (rule.kind) {
    case "limit": {
      return rule.ceiling;
    }
    case "noWorse": {
      return baseWorst === null
        ? null
        : baseWorst * (1 + rule.share) + rule.slack;
    }
    default: {
      return rule satisfies never;
    }
  }
};

const boundText = (rule: CompareRule, bound: number | null): string => {
  switch (rule.kind) {
    case "limit": {
      return `${UNITS[rule.unit](rule.ceiling)}, a limit`;
    }
    case "noWorse": {
      const growth = `base's worst run plus ${rule.share * PERCENT}% and ${UNITS[rule.unit](rule.slack)}`;
      return bound === null ? growth : `${UNITS[rule.unit](bound)}, ${growth}`;
    }
    default: {
      return rule satisfies never;
    }
  }
};

const judge = (
  rule: CompareRule,
  base: readonly number[],
  head: readonly number[]
): Judged => {
  const baseWorst = worstOf(base);
  if (head.length === 0) {
    return baseWorst === null
      ? {
          bound: null,
          note: "Neither build measured it.",
          outcome: "not judged",
        }
      : {
          bound: null,
          note: `Head measured nothing where base's worst run read ${UNITS[rule.unit](baseWorst)}.`,
          outcome: "FAIL",
        };
  }
  const bound = boundOf(rule, baseWorst);
  if (bound === null) {
    return {
      bound,
      note: "Base measured nothing to compare with.",
      outcome: "not judged",
    };
  }
  const over = head.filter((value) => value > bound).length;
  if (over === 0) {
    return { bound, note: "", outcome: "pass" };
  }
  const broke = `${over} of ${head.length} head runs are over ${boundText(rule, bound)}.`;
  if (rule.kind === "limit" && baseWorst !== null && baseWorst > bound) {
    return {
      bound,
      note: `${broke} Base breaks it too, at worst ${UNITS[rule.unit](baseWorst)}.`,
      outcome: "known gap",
    };
  }
  return over === head.length
    ? { bound, note: broke, outcome: "FAIL" }
    : {
        bound,
        note: `${broke} It does not fail, because a regression that shows in only some runs passes this gate. Run more runs of both builds to settle it.`,
        outcome: "mixed",
      };
};

interface Verdict {
  readonly description: string;
  readonly id: string;
  readonly link: RunName;
  readonly measured: string;
  readonly note: string;
  readonly outcome: Outcome;
}

interface Section {
  readonly lines: readonly string[];
  readonly verdicts: readonly Verdict[];
}

const reachText = (runs: readonly NetworkReport[]): string => {
  const rows = runs.flatMap((run) => run.rows);
  return `${runs.length} runs, ${rows.filter((row) => row.pressed).length} of ${rows.length} strikes in reach`;
};

const present = (values: readonly (number | null)[]): readonly number[] =>
  values.flatMap((value) => (value === null ? [] : [value]));

const runCells = (rule: CompareRule, values: readonly (number | null)[]) =>
  values.map((value) => (value === null ? "none" : UNITS[rule.unit](value)));

const runHeads = (side: string, runs: readonly NetworkReport[]) =>
  runs.map((_, index) => `${side} ${index + 1}`);

const linkSection = (
  link: RunName,
  base: readonly NetworkReport[],
  head: readonly NetworkReport[]
): Section => {
  const rows = RULES.map((rule) => {
    const before = base.map(rule.perRun);
    const after = head.map(rule.perRun);
    return {
      after,
      before,
      judged: judge(rule, present(before), present(after)),
      rule,
    };
  });
  const columns = [
    "Measure",
    ...runHeads("Base", base),
    ...runHeads("Head", head),
    "Head must stay at or under",
    "Verdict",
  ];
  return {
    lines: [
      `## ${link}`,
      "",
      `Base: ${reachText(base)}. Head: ${reachText(head)}.`,
      "",
      `| ${columns.join(" | ")} |`,
      `|${" --- |".repeat(columns.length)}`,
      ...rows.map(
        ({ after, before, judged: { bound, outcome }, rule }) =>
          `| ${[rule.label, ...runCells(rule, before), ...runCells(rule, after), boundText(rule, bound), outcome].join(" | ")} |`
      ),
      "",
    ],
    verdicts: rows.map(({ judged: { note, outcome }, rule }) => ({
      description: rule.description,
      id: rule.id,
      link,
      measured: rule.measured,
      note,
      outcome,
    })),
  };
};

const oneSided = (
  link: RunName,
  ran: "base" | "head",
  runs: readonly NetworkReport[]
): Section => ({
  lines: [
    `## ${link}`,
    "",
    `Only ${ran} ran this link (${runs.length} runs), so nothing on it is judged. Run it on both builds, or on neither.`,
    "",
  ],
  verdicts: [
    {
      description: "Both builds ran every link the comparison reads.",
      id: "link-on-both",
      link,
      measured: "",
      note: `Only ${ran} ran it.`,
      outcome: "FAIL",
    },
  ],
});

const runsOf = (runs: readonly NetworkReport[], link: RunName) =>
  runs.filter((run) => run.network === link);

const verdictLine = ({
  description,
  id,
  link,
  measured,
  note,
  outcome,
}: Verdict) =>
  `- ${outcome} ${link} ${id}. ${[note, description, measured].filter((text) => text !== "").join(" ")}`;

const comparison = (
  base: readonly NetworkReport[],
  head: readonly NetworkReport[],
  sources: string
) => {
  const sections = RUN_NAMES.flatMap((link) => {
    const before = runsOf(base, link);
    const after = runsOf(head, link);
    if (before.length === 0 && after.length === 0) {
      return [];
    }
    if (after.length === 0) {
      return [oneSided(link, "base", before)];
    }
    return before.length === 0
      ? [oneSided(link, "head", after)]
      : [linkSection(link, before, after)];
  });
  const verdicts = sections.flatMap((section) => section.verdicts);
  const failures = verdicts.filter((verdict) => verdict.outcome === "FAIL");
  const mixed = verdicts.filter((verdict) => verdict.outcome === "mixed");
  const flagged = verdicts.filter((verdict) => verdict.outcome !== "pass");
  const summary =
    failures.length === 0
      ? `Head passes all ${verdicts.length} checks${mixed.length === 0 ? "" : `, with ${mixed.length} mixed`}.`
      : `Head fails ${failures.length} of ${verdicts.length} checks.`;
  return {
    failures,
    markdown: [
      "# Netcode comparison",
      "",
      sources,
      "",
      "Each rule judges every run on its own. A rule fails only when every head run breaks its bound, so the gate avoids failing on run-to-run noise at the cost of passing a regression that shows in only some runs. Such a rule reads mixed.",
      "",
      ...sections.flatMap((section) => section.lines),
      "## Verdicts",
      "",
      ...flagged.map(verdictLine),
      `- ${summary}`,
      "",
    ].join("\n"),
    summary,
  };
};

const readRuns = Effect.fn("rooms.compare.read")(function* readRuns(
  dirs: readonly string[]
) {
  const files = yield* FileSystem.FileSystem;
  const runs: NetworkReport[] = [];
  for (const dir of dirs) {
    const names = yield* files
      .readDirectory(dir)
      .pipe(Effect.mapError(failed(`Could not read ${dir}.`)));
    const reports = names.filter((name) => REPORT_FILE.test(name)).toSorted();
    if (reports.length === 0) {
      return yield* new FightCompareFailed({
        message: `${dir} holds no rooms:fights report, a <link>.json file.`,
      });
    }
    for (const name of reports) {
      runs.push(
        yield* files
          .readFileString(`${dir}/${name}`)
          .pipe(
            Effect.flatMap(decodeReport),
            Effect.mapError(
              failed(`${dir}/${name} is not a rooms:fights report.`)
            )
          )
      );
    }
  }
  return runs;
});

const dirsOf = (list: string): readonly string[] =>
  list.split(",").filter((dir) => dir !== "");

export const main = Effect.fn("rooms.compare")(function* main(
  args: readonly string[]
) {
  const { values } = yield* Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${USAGE}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: {
          base: { type: "string" },
          head: { type: "string" },
          out: { type: "string" },
        },
      }),
  });
  const baseDirs = dirsOf(values.base ?? "");
  const headDirs = dirsOf(values.head ?? "");
  if (baseDirs.length === 0 || headDirs.length === 0) {
    return yield* new UsageError({ message: USAGE });
  }
  const result = comparison(
    yield* readRuns(baseDirs),
    yield* readRuns(headDirs),
    `Base: ${baseDirs.join(", ")}. Head: ${headDirs.join(", ")}.`
  );
  yield* Console.log(result.markdown);
  if (values.out !== undefined) {
    const files = yield* FileSystem.FileSystem;
    yield* files
      .writeFileString(values.out, result.markdown)
      .pipe(Effect.mapError(failed(`Could not write ${values.out}.`)));
  }
  if (result.failures.length > 0) {
    return yield* new FightCompareFailed({ message: result.summary });
  }
  return result.summary;
});
