import type { ResultRow } from "@racer/career/result";
import type { Ledger } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import { creditLimitOf, roads } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";
import { rivals } from "@racer/sim/cast";
import type { RivalId } from "@racer/sim/cast";
import { formatMoney, Money } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { cn } from "@racer/ui/utils";
import type { ReactNode } from "react";

import { figures, officerFigures, plates } from "../../assets/clubhouse-art.ts";
import { magsLine, shortNames } from "../../career/copy.ts";
import type { RaceReport } from "../../career/flow.ts";
import {
  bikeName,
  ordinal,
  raceTime,
  shortBike,
  weaponLabel,
} from "../../career/format.ts";
import { incidentLines } from "../../career/notes.ts";
import { BarHeader, BarNav } from "./bar-chrome.tsx";
import type { BarAction } from "./bar-chrome.tsx";
import {
  BarBackdrop,
  BarLight,
  BarSeats,
  SpeechSticker,
  useBarClock,
} from "./clubhouse-bar.tsx";
import type { Speech } from "./clubhouse-bar.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { stampStyle } from "./clubhouse-wall.tsx";

const SHEET_SCALE = 0.7;
const SHEET = { h: 740, w: 570, x: 548, y: 104 } as const;
const SHEET_TITLE = { h: 62, w: 470, x: 590, y: 136 } as const;
const SHEET_ROWS = { h: 475, w: 512, x: 566, y: 248 } as const;
const OUTCOME = { h: 146, w: 500, x: 1146, y: 104 } as const;
const LEDGER = { h: 403, w: 560, x: 1100, y: 262 } as const;
const LEDGER_TEXT = { h: 250, w: 280, x: 1162, y: 334 } as const;
const NOTE = { h: 270, w: 456, x: 1166, y: 610 } as const;
const NOTE_TEXT = { h: 175, w: 264, x: 1201, y: 664 } as const;

const ROWS = 15;
const MAGS: RivalId = "mags-dunleavy";
const NOTE_LONG = 90;
const NOTE_LONGER = 150;

const sheetBorder = (
  top: number,
  right: number,
  bottom: number,
  left: number
) =>
  [top, right, bottom, left]
    .map((edge) => stagePx(edge * SHEET_SCALE))
    .join(" ");

const sheetStyle = {
  ...place(SHEET),
  borderImage: `url(${plates.standings}) 297 50 445 80 fill / ${sheetBorder(297, 50, 445, 80)} stretch round`,
  borderStyle: "solid",
  borderWidth: sheetBorder(297, 50, 445, 80),
};

const gapFrom = (rows: readonly ResultRow[]): number => {
  if (rows.some((row) => row.fate === "finished")) {
    return 0;
  }
  return Math.min(
    ...rows.filter((row) => row.fate === "racing").map((row) => row.metresLeft)
  );
};

const resultOf = (row: ResultRow, reference: number): ReactNode => {
  if (row.fate === "finished") {
    return raceTime(row.finishTick);
  }
  if (row.fate === "racing") {
    const behind = Math.max(0, Math.round(row.metresLeft - reference));
    if (behind === 0 && reference > 0) {
      return "Leading";
    }
    return (
      <>
        + {behind} <span className="normal-case">m</span>
      </>
    );
  }
  return row.fate === "busted" ? "Busted" : "Wrecked";
};

const RaceSheet = ({ report }: { readonly report: RaceReport }) => {
  const { rows } = report.summary;
  const reference = gapFrom(rows);
  const notes = incidentLines(report.summary.incidents);
  const paid = report.ledger !== null;
  return (
    <section aria-label="Race result">
      <div aria-hidden style={sheetStyle} />
      <h2
        className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black whitespace-nowrap uppercase"
        style={{ ...place(SHEET_TITLE), fontSize: stagePx(36) }}
      >
        {roads[report.roadId].name} · Level {report.level}
      </h2>
      {rows.length === 0 ? (
        <p
          className="font-display text-ink font-bold uppercase"
          style={{ ...place(SHEET_ROWS), fontSize: stagePx(24) }}
        >
          You left before the race was run. Nobody was classified.
        </p>
      ) : (
        <ol
          className="font-display text-ink grid -rotate-[0.4deg] font-bold uppercase"
          style={{
            ...place(SHEET_ROWS),
            fontSize: stagePx(21),
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
        >
          {rows.map((row) => {
            const you = row.racer === "player";
            const note = notes.find((each) => each.racer === row.racer)?.text;
            return (
              <li
                className={cn(
                  "grid grid-cols-[1.4em_minmax(0,1fr)_3.6em_4.6em_3.6em] items-end gap-x-[0.4em] pr-[0.3em] pb-[0.12em] leading-[0.8]",
                  you && "bg-neon-yellow/85"
                )}
                key={row.racer}
              >
                <span className="numeric text-center">{row.place}</span>
                <span className="truncate">
                  {you ? "You" : shortNames[row.racer]}
                  {note !== undefined && (
                    <span className="text-neon-red ml-[0.5em] text-[0.6em]">
                      {note}
                    </span>
                  )}
                </span>
                <span className="text-ink/60 text-[0.62em]">
                  {shortBike(bikeName(row.bikeId))}
                </span>
                <span className="numeric text-right">
                  {resultOf(row, reference)}
                </span>
                <span className="numeric text-right">
                  {paid ? formatMoney(row.prize) : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

const headlineOf = (report: RaceReport): string => {
  if (report.result === "busted") {
    return "Busted";
  }
  if (report.result === "quit") {
    return "Quit";
  }
  return report.result === "wrecked" ? "Wrecked" : ordinal(report.place);
};

const verdictOf = ({ ledger, summary, result }: RaceReport): string => {
  const { bust, wreck } = summary;
  if (bust) {
    const taken =
      bust.weapon === "none"
        ? ""
        : ` · Took your ${weaponLabel(bust.weapon).toLowerCase()}`;
    return `Km ${bust.km.toFixed(1)}${taken}`;
  }
  if (wreck) {
    return result === "quit"
      ? `Pulled out at km ${wreck.km.toFixed(1)}`
      : `${wreck.km.toFixed(1)} km in, the bike gave up`;
  }
  if (!ledger) {
    return "Single race";
  }
  if (ledger.qualified) {
    return `Qualified · ${ledger.qualifiedCount} / 5 roads`;
  }
  return ledger.repeat ? "Qualified already" : "Not qualified";
};

const Outcome = ({ report }: { readonly report: RaceReport }) => {
  const good = report.result === "finished";
  return (
    <div
      className="font-display flex flex-col items-center justify-center gap-[0.5em] font-bold uppercase"
      style={place(OUTCOME)}
    >
      <p
        className={cn(
          stampStyle,
          "bg-ink/80 -rotate-6",
          good
            ? "text-neon-yellow border-neon-yellow"
            : "text-neon-red border-neon-red"
        )}
        style={{ fontSize: stagePx(78) }}
      >
        {headlineOf(report)}
      </p>
      <p
        className="text-paper bg-ink/80 -rotate-2 px-[0.4em] tracking-wide"
        style={{ fontSize: stagePx(24) }}
      >
        {verdictOf(report)}
      </p>
    </div>
  );
};

const prizeLabel = (ledger: Ledger): string => {
  if (ledger.result !== "finished") {
    return "Prize";
  }
  if (!ledger.repeat) {
    return `Prize, ${ordinal(ledger.place)}`;
  }
  return ledger.prize > 0 ? "Prize · Half, repeat run" : "Repeat run · No pay";
};

const LedgerLine = ({
  label,
  amount,
  total = false,
}: {
  readonly label: ReactNode;
  readonly amount: number;
  readonly total?: boolean;
}) => (
  <div
    className={cn(
      "flex items-baseline justify-between gap-[0.6em]",
      total && "mt-[0.2em] border-t-2 border-dashed border-white/40 pt-[0.3em]"
    )}
  >
    <dt className={total ? "text-[1.25em]" : "text-paper/80"}>{label}</dt>
    <dd>
      <Money
        amount={amount}
        className={total ? "text-[1.25em]" : ""}
        kind={total ? "balance" : "flow"}
      />
    </dd>
  </div>
);

const Takings = ({ ledger }: { readonly ledger: Ledger }) => (
  <section aria-label="Money">
    <Plate box={LEDGER} src={plates.noteCyan} />
    <dl
      className="font-display text-paper flex -rotate-3 flex-col justify-center gap-[0.25em] leading-none font-bold uppercase"
      style={{ ...place(LEDGER_TEXT), fontSize: stagePx(21) }}
    >
      <LedgerLine amount={ledger.prize} label={prizeLabel(ledger)} />
      <LedgerLine
        amount={-ledger.repair}
        label={ledger.repairHalved ? "Repairs · Half" : "Repairs"}
      />
      <LedgerLine amount={-ledger.fine} label="Fines" />
      {ledger.envelope !== 0 && (
        <LedgerLine amount={ledger.envelope} label="Vic's envelope" />
      )}
      <LedgerLine
        amount={ledger.cashAfter}
        label={ledger.cashAfter < 0 ? "Owed" : "Cash"}
        total
      />
    </dl>
  </section>
);

const repossessionText = (ledger: Ledger): string | null => {
  if (!ledger.repossessed) {
    return null;
  }
  const { bikeId, tradeIn } = ledger.repossessed;
  const settled =
    ledger.cashAfter >= 0
      ? `It sold for ${formatMoney(tradeIn)}, paid what you owed, and left you ${formatMoney(ledger.cashAfter)}.`
      : `It sold for ${formatMoney(tradeIn)}. You still owe ${formatMoney(-ledger.cashAfter)}.`;
  return `The garage took the ${bikeName(bikeId)}. ${settled} You ride the Gutter Pup now. It can't outrun a cop. Stay on it.`;
};

const warningOf = (ledger: Ledger, riding: BikeId): string | null => {
  const debt = Math.max(0, -ledger.cashAfter);
  if (ledger.gameOver) {
    return `You owe ${formatMoney(debt)} on a Gutter Pup. Vic wants a word.`;
  }
  const taken = repossessionText(ledger);
  if (taken !== null) {
    return taken;
  }
  return debt > 0
    ? `You owe ${formatMoney(debt)}. Limit ${formatMoney(creditLimitOf(riding))}. Past that, the garage takes the bike.`
    : null;
};

interface Note {
  readonly text: string;
  readonly warning: boolean;
}

const noteOf = (report: RaceReport, riding: BikeId): Note | null => {
  const warning = report.ledger ? warningOf(report.ledger, riding) : null;
  if (warning !== null) {
    return { text: warning, warning: true };
  }
  return report.ledger
    ? null
    : { text: "Nothing is written to the career.", warning: false };
};

const noteSize = (text: string): number => {
  if (text.length > NOTE_LONGER) {
    return 16;
  }
  return text.length > NOTE_LONG ? 19 : 24;
};

const MagentaNote = ({ note: { text, warning } }: { readonly note: Note }) => (
  <>
    <Plate box={NOTE} src={plates.noteMagenta} />
    <p
      className="font-display text-ink flex -rotate-6 flex-col justify-center leading-[1.05] font-black uppercase"
      role={warning ? "alert" : undefined}
      style={{ ...place(NOTE_TEXT), fontSize: stagePx(noteSize(text)) }}
    >
      {text}
    </p>
  </>
);

const speakerOf = (
  report: RaceReport
): { readonly figure: string; readonly speech: Speech } | null => {
  const { bust, wreck, raceId, rows } = report.summary;
  if (bust) {
    return {
      figure: officerFigures[bust.officer],
      speech: { line: bust.line, name: bust.officerName, tag: "Booked you" },
    };
  }
  if (report.ledger && wreck) {
    return {
      figure: figures[MAGS],
      speech: {
        line: magsLine(raceId),
        name: rivals[MAGS].name,
        tag: "Fixes the bikes",
      },
    };
  }
  const { line } = report;
  if (!line) {
    return null;
  }
  const row = rows.find((each) => each.racer === line.rival);
  return {
    figure: figures[line.rival],
    speech: {
      line: line.text,
      name: rivals[line.rival].name,
      tag: row ? ordinal(row.place) : undefined,
    },
  };
};

export const ResultsScreen = ({
  report,
  career,
  riding,
  canRaceAgain,
  repeatRun,
  onContinue,
  onRaceAgain,
}: {
  readonly report: RaceReport;
  readonly career: CareerState | null;
  readonly riding: BikeId;
  readonly canRaceAgain: boolean;
  readonly repeatRun: boolean;
  readonly onContinue: () => void;
  readonly onRaceAgain: () => void;
}) => {
  const clock = useBarClock();
  const speaker = speakerOf(report);
  const note = noteOf(report, riding);
  const actions: BarAction[] = [
    ...(canRaceAgain
      ? [
          {
            id: "again",
            label: repeatRun ? "Race again · Half pay" : "Race again",
            run: onRaceAgain,
          },
        ]
      : []),
    { id: "continue", label: "Continue", run: onContinue },
  ];
  return (
    <Screen
      className="flex"
      enter="fade"
      style={{
        backgroundImage: `url(${plates.wall})`,
        backgroundSize: "60vw auto",
      }}
    >
      <Stage>
        <BarBackdrop clock={clock} />
        <BarSeats figure={speaker?.figure ?? null} />
        {speaker && <SpeechSticker speech={speaker.speech} />}
        <BarHeader career={career} />
        <RaceSheet report={report} />
        <Outcome report={report} />
        {report.ledger && <Takings ledger={report.ledger} />}
        {note !== null && <MagentaNote note={note} />}
        <BarLight clock={clock} />
        <BarNav actions={actions} label="Results" primary="continue">
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(20) }}
          >
            {report.ledger ? "Settled and saved" : "Single race"}
          </p>
        </BarNav>
      </Stage>
    </Screen>
  );
};
