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
const COUNT_DIGITS = 2;

class FightCompareFailed extends Data.TaggedError("FightCompareFailed")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

const failed = (message: string) => (cause: unknown) =>
  new FightCompareFailed({ cause, message });

const decodeReport = Schema.decodeUnknownEffect(
  Schema.fromJsonString(NetworkReportSchema)
);

type Values = readonly [number, ...number[]];

const STATISTICS = {
  mean: (values: Values) =>
    values.reduce((total, value) => total + value, 0) / values.length,
  median: (values: Values) => {
    const sorted = values.toSorted((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const upper = sorted[middle] ?? values[0];
    return sorted.length % 2 === 1
      ? upper
      : ((sorted[middle - 1] ?? upper) + upper) / 2;
  },
  worst: (values: Values) => Math.max(...values),
} as const;

type Statistic = keyof typeof STATISTICS;

const UNITS = {
  count: (value: number) => String(Number(value.toFixed(COUNT_DIGITS))),
  metres: (value: number) => `${value.toFixed(2)} m`,
  ms: (value: number) => `${Math.round(value)} ms`,
} as const;

type Unit = keyof typeof UNITS;

interface RuleBase {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly samples: (run: NetworkReport) => readonly number[];
  readonly statistic: Statistic;
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

const drawnTracks =
  (pick: (track: NetworkReport["tracks"][number]["drawn"]) => number) =>
  (run: NetworkReport): readonly number[] =>
    run.tracks.flatMap(({ drawn }) => (drawn.frames > 0 ? [pick(drawn)] : []));

const rowValues =
  (pick: (row: BoutRow) => number | null) =>
  (run: NetworkReport): readonly number[] =>
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
    samples: (run) => [run.rows.filter(failedStrike).length],
    statistic: "worst",
    unit: "count",
  },
  {
    description: "The room rides every button press a rider makes.",
    id: "presses-dropped",
    kind: "noWorse",
    label: "Presses the room dropped in a run",
    samples: (run) => [
      run.rows.reduce((total, row) => total + row.lostPresses, 0),
    ],
    share: 0,
    slack: 0,
    statistic: "mean",
    unit: "count",
  },
  {
    description:
      "The rival is drawn where the room had them, judged by the 95th percentile of the sideways gap over every drawn frame.",
    id: "rival-drawn-off",
    kind: "noWorse",
    label: "Rival drawn off the room's place, p95",
    samples: drawnTracks((track) => track.errorP95Metres),
    share: 0.25,
    slack: 0.1,
    statistic: "worst",
    unit: "metres",
  },
  {
    ceiling: 2 * BIKE_HALF_WIDTH,
    description:
      "The rival never jumps sideways more than a bike's width between two frames. Steering and a kick's shove move a bike under 0.2 m a frame, so a bigger jump is a snap the player sees.",
    id: "rival-snap",
    kind: "limit",
    label: "Rival's biggest sideways jump between frames",
    samples: drawnTracks((track) => track.worstStepMetres),
    statistic: "worst",
    unit: "metres",
  },
  {
    ceiling: weapons.none.reachX / 2,
    description:
      "When a hit lands, the victim sees the attacker within half a bare-hand reach of where the room had them, so no hit lands from a bike drawn out of reach.",
    id: "attacker-off-at-hit",
    kind: "limit",
    label: "Attacker drawn off the room's place at the hit",
    samples: rowValues((row) => row.drawnErrorAtHitMetres),
    statistic: "worst",
    unit: "metres",
  },
  {
    description:
      "A strike reaches full extension on the victim's screen no later after the press than it did before.",
    id: "press-to-strike-out",
    kind: "noWorse",
    label: "Press to the strike drawn fully out",
    samples: rowValues((row) => row.pressToStrikeOutMs),
    share: 0.15,
    slack: TICK_SECONDS * MS_PER_SECOND,
    statistic: "median",
    unit: "ms",
  },
] as const satisfies readonly CompareRule[];

export type RuleId = (typeof RULES)[number]["id"];

const OUTCOMES = ["pass", "FAIL", "known gap", "not judged"] as const;

type Outcome = (typeof OUTCOMES)[number];

interface Judged {
  readonly bound: number | null;
  readonly note: string;
  readonly outcome: Outcome;
}

interface Measured {
  readonly samples: readonly number[];
  readonly value: number | null;
}

const measure = (
  rule: CompareRule,
  runs: readonly NetworkReport[]
): Measured => {
  const samples = runs.flatMap(rule.samples);
  const [first, ...rest] = samples;
  return {
    samples,
    value:
      first === undefined ? null : STATISTICS[rule.statistic]([first, ...rest]),
  };
};

const shown = (rule: CompareRule, value: number) =>
  `${rule.statistic} ${UNITS[rule.unit](value)}`;

const judge = (
  rule: CompareRule,
  base: number | null,
  head: number | null
): Judged => {
  if (head === null) {
    return base === null
      ? {
          bound: null,
          note: "Neither build measured it.",
          outcome: "not judged",
        }
      : {
          bound: null,
          note: `Head measured nothing where base measured ${shown(rule, base)}.`,
          outcome: "FAIL",
        };
  }
  switch (rule.kind) {
    case "limit": {
      const bound = rule.ceiling;
      if (head <= bound) {
        return { bound, note: "", outcome: "pass" };
      }
      return base !== null && base > bound
        ? {
            bound,
            note: `Head ${shown(rule, head)} is over ${UNITS[rule.unit](bound)}, and base breaks it too at ${shown(rule, base)}.`,
            outcome: "known gap",
          }
        : {
            bound,
            note: `Head ${shown(rule, head)} is over ${UNITS[rule.unit](bound)}, which base keeps.`,
            outcome: "FAIL",
          };
    }
    case "noWorse": {
      if (base === null) {
        return {
          bound: null,
          note: "Base measured nothing to compare with.",
          outcome: "not judged",
        };
      }
      const bound = base * (1 + rule.share) + rule.slack;
      return head <= bound
        ? { bound, note: "", outcome: "pass" }
        : {
            bound,
            note: `Head ${shown(rule, head)} is over ${UNITS[rule.unit](bound)}, base ${shown(rule, base)} plus ${rule.share * PERCENT}% and ${UNITS[rule.unit](rule.slack)}.`,
            outcome: "FAIL",
          };
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
      const growth = `base plus ${rule.share * PERCENT}% and ${UNITS[rule.unit](rule.slack)}`;
      return bound === null ? growth : `${UNITS[rule.unit](bound)}, ${growth}`;
    }
    default: {
      return rule satisfies never;
    }
  }
};

const cell = (rule: CompareRule, { samples, value }: Measured): string => {
  const [first, ...rest] = samples;
  if (first === undefined || value === null) {
    return "no sample";
  }
  const others = (["median", "worst"] as const)
    .filter((statistic) => statistic !== rule.statistic)
    .map(
      (statistic) =>
        `${statistic} ${UNITS[rule.unit](STATISTICS[statistic]([first, ...rest]))}`
    );
  return `${shown(rule, value)} (${[...others, `${samples.length} samples`].join(", ")})`;
};

interface Verdict {
  readonly description: string;
  readonly id: string;
  readonly link: RunName;
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

const TABLE_HEAD = [
  "| Measure | Base | Head | Head must stay at or under | Verdict |",
  "| --- | --- | --- | --- | --- |",
];

const linkSection = (
  link: RunName,
  base: readonly NetworkReport[],
  head: readonly NetworkReport[]
): Section => {
  const rows = RULES.map((rule) => {
    const before = measure(rule, base);
    const after = measure(rule, head);
    return {
      after,
      before,
      judged: judge(rule, before.value, after.value),
      rule,
    };
  });
  return {
    lines: [
      `## ${link}`,
      "",
      `Base: ${reachText(base)}. Head: ${reachText(head)}.`,
      "",
      ...TABLE_HEAD,
      ...rows.map(
        ({ after, before, judged: { bound, outcome }, rule }) =>
          `| ${rule.label} | ${cell(rule, before)} | ${cell(rule, after)} | ${boundText(rule, bound)} | ${outcome} |`
      ),
      "",
    ],
    verdicts: rows.map(({ judged: { note, outcome }, rule }) => ({
      description: rule.description,
      id: rule.id,
      link,
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
      note: `Only ${ran} ran it.`,
      outcome: "FAIL",
    },
  ],
});

const runsOf = (runs: readonly NetworkReport[], link: RunName) =>
  runs.filter((run) => run.network === link);

const verdictLine = ({ description, id, link, note, outcome }: Verdict) =>
  `- ${outcome} ${link} ${id}. ${note} ${description}`;

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
  const flagged = verdicts.filter((verdict) => verdict.outcome !== "pass");
  const summary =
    failures.length === 0
      ? `Head passes all ${verdicts.length} checks.`
      : `Head fails ${failures.length} of ${verdicts.length} checks.`;
  return {
    failures,
    markdown: [
      "# Netcode comparison",
      "",
      sources,
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
