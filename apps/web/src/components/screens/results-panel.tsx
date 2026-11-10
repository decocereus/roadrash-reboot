import type { ResultRow } from "@racer/career/result";
import type { Ledger } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import { endings } from "@racer/career/story";
import { creditLimitOf, roadList, roads } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";
import {
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import { formatMoney, Money } from "@racer/ui/components/money";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { cn } from "@racer/ui/utils";
import type { ReactNode } from "react";

import { BROKE_CARD, shortNames } from "../../career/copy.ts";
import type { RaceReport } from "../../career/flow.ts";
import {
  bikeName,
  ordinal,
  raceTime,
  weaponLabel,
} from "../../career/format.ts";
import { RiderChip } from "./shared.tsx";

const SHOWN_PLACES = 5;

const gapFrom = (rows: readonly ResultRow[]): number => {
  if (rows.some((row) => row.fate === "finished")) {
    return 0;
  }
  return Math.min(
    ...rows.filter((row) => row.fate === "racing").map((row) => row.metresLeft)
  );
};

const resultOf = (row: ResultRow, reference: number): string => {
  if (row.fate === "finished") {
    return raceTime(row.finishTick);
  }
  if (row.fate === "racing") {
    const behind = Math.max(0, Math.round(row.metresLeft - reference));
    return behind === 0 && reference > 0 ? "Leading" : `+${behind} m`;
  }
  return row.fate === "busted" ? "Busted" : "Wrecked";
};

const headlineOf = (report: RaceReport): string => {
  switch (report.result) {
    case "busted": {
      return "Busted";
    }
    case "quit": {
      return "Quit";
    }
    case "wrecked": {
      return "Wrecked";
    }
    case "finished": {
      return `${ordinal(report.place)} of ${report.summary.rows.length}`;
    }
    default: {
      return report.result satisfies never;
    }
  }
};

const verdictOf = ({ ledger, summary, result }: RaceReport): string | null => {
  const { bust, wreck } = summary;
  if (bust) {
    const taken =
      bust.weapon === "none"
        ? ""
        : `, took your ${weaponLabel(bust.weapon).toLowerCase()}`;
    return `Booked at km ${bust.km.toFixed(1)}${taken}.`;
  }
  if (wreck) {
    return result === "quit"
      ? `Pulled out at km ${wreck.km.toFixed(1)}.`
      : `${wreck.km.toFixed(1)} km in, the bike gave up.`;
  }
  if (!ledger) {
    return null;
  }
  if (ledger.qualified) {
    return `Qualified, ${ledger.qualifiedCount} of ${roadList.length} roads.`;
  }
  return ledger.repeat ? "Qualified already." : "Not qualified.";
};

const nameOf = (report: RaceReport, row: ResultRow): ReactNode => {
  const you = row.racer === "player";
  const colour = you
    ? report.room?.myColour
    : report.room?.colours.get(row.racer);
  const name = you
    ? "You"
    : (report.room?.names.get(row.racer) ?? shortNames[row.racer]);
  return (
    <>
      {colour !== undefined && <RiderChip colour={colour} />} {name}
    </>
  );
};

const Placings = ({ report }: { readonly report: RaceReport }) => {
  const { rows } = report.summary;
  if (rows.length === 0) {
    return (
      <PanelLine tone="quiet">
        You left before the race was run. Nobody was placed.
      </PanelLine>
    );
  }
  const reference = gapFrom(rows);
  const yours = rows.findIndex((row) => row.racer === "player");
  const shown = rows.slice(0, Math.max(SHOWN_PLACES, yours + 1));
  const behind = rows.length - shown.length;
  return (
    <>
      <ol aria-label="Placings" className="flex flex-col">
        {shown.map((row) => (
          <li
            className={cn(
              "border-paper/15 grid grid-cols-[2.2em_1fr_auto] items-center gap-2.5 border-b py-1 text-xl font-bold tracking-normal normal-case",
              row.racer === "player" ? "text-neon-yellow" : "text-paper"
            )}
            key={row.racer}
          >
            <b className="text-[1.15em] font-extrabold italic">{row.place}</b>
            <span className="truncate">{nameOf(report, row)}</span>
            <span
              className={cn(
                "numeric",
                row.racer === "player" ? "" : "text-paper/65"
              )}
            >
              {resultOf(row, reference)}
            </span>
          </li>
        ))}
      </ol>
      {behind > 0 && (
        <PanelLine tone="quiet">{behind} more behind you.</PanelLine>
      )}
    </>
  );
};

const prizeLabel = (ledger: Ledger): string => {
  if (ledger.result !== "finished") {
    return "Prize";
  }
  if (!ledger.repeat) {
    return `Prize, ${ordinal(ledger.place)}`;
  }
  return ledger.prize > 0 ? "Half prize, repeat run" : "Repeat run, no pay";
};

const LedgerLine = ({
  label,
  amount,
  total = false,
}: {
  readonly label: string;
  readonly amount: number;
  readonly total?: boolean;
}) => (
  <div
    className={cn(
      "flex items-baseline justify-between gap-3",
      total && "border-paper/40 mt-1 border-t-2 border-dashed pt-1"
    )}
  >
    <dt className={total ? "text-paper" : "text-paper/75"}>{label}</dt>
    <dd>
      <Money amount={amount} kind={total ? "balance" : "flow"} />
    </dd>
  </div>
);

const Takings = ({ ledger }: { readonly ledger: Ledger }) => (
  <dl
    aria-label="Money"
    className="flex flex-col gap-0.5 text-lg font-bold tracking-normal"
  >
    <LedgerLine amount={ledger.prize} label={prizeLabel(ledger)} />
    <LedgerLine
      amount={-ledger.repair}
      label={ledger.repairHalved ? "Half repairs" : "Repairs"}
    />
    <LedgerLine amount={-ledger.fine} label="Fines" />
    <LedgerLine
      amount={ledger.cashAfter}
      label={ledger.cashAfter < 0 ? "Owed" : "Cash"}
      total
    />
  </dl>
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
  return `The garage took the ${bikeName(bikeId)}. ${settled} You ride the Gutter Pup now.`;
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

const RaceSheet = ({
  report,
  riding,
}: {
  readonly report: RaceReport;
  readonly riding: BikeId;
}) => {
  const verdict = verdictOf(report);
  const warning = report.ledger ? warningOf(report.ledger, riding) : null;
  return (
    <>
      <PanelTitle>{headlineOf(report)}</PanelTitle>
      <PanelRule />
      <PanelLine>
        {roads[report.roadId].name}
        {report.ledger ? `, tier ${report.tier}` : ""}
      </PanelLine>
      {verdict !== null && <PanelLine tone="quiet">{verdict}</PanelLine>}
      <Placings report={report} />
      {report.ledger && <Takings ledger={report.ledger} />}
      {warning !== null && (
        <PanelLine role="alert" tone="warn">
          {warning}
        </PanelLine>
      )}
    </>
  );
};

const continueDetail = (report: RaceReport): string => {
  const { ledger } = report;
  if (ledger === null) {
    return "Back to the bar.";
  }
  if (ledger.gameOver) {
    return "Your career is over.";
  }
  return ledger.ending === null ? "Back to the bar." : "The season is done.";
};

export const SoloResults = ({
  report,
  riding,
  canRaceAgain,
  repeatRun,
  onContinue,
  onRaceAgain,
}: {
  readonly report: RaceReport;
  readonly riding: BikeId;
  readonly canRaceAgain: boolean;
  readonly repeatRun: boolean;
  readonly onContinue: () => void;
  readonly onRaceAgain: () => void;
}) => (
  <>
    <RaceSheet report={report} riding={riding} />
    <SkewButton
      detail={continueDetail(report)}
      onClick={onContinue}
      title="Continue"
      tone="primary"
    />
    {canRaceAgain && (
      <SkewButton
        detail={repeatRun ? "Same road, half pay." : "Same road."}
        onClick={onRaceAgain}
        title="Race again"
      />
    )}
    {report.ledger && (
      <PanelLine tone="quiet">
        {report.unsaved ? "Settled, not saved" : "Settled and saved"}
      </PanelLine>
    )}
  </>
);

export const RoomResults = ({
  report,
  riding,
  onNextRace,
  onLeave,
}: {
  readonly report: RaceReport;
  readonly riding: BikeId;
  readonly onNextRace: () => void;
  readonly onLeave: () => void;
}) => (
  <>
    <RaceSheet report={report} riding={riding} />
    <SkewButton
      detail="Back to the lobby."
      onClick={onNextRace}
      title="Next race"
      tone="primary"
    />
    <TextLinks>
      <TextButton onClick={onLeave}>Leave</TextButton>
    </TextLinks>
  </>
);

const RecordLine = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-paper/75">{label}</dt>
    <dd className="numeric text-right">{value}</dd>
  </div>
);

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const overOf = (career: CareerState) => {
  const ending = career.story.ending ? endings[career.story.ending] : null;
  if (career.gameOver || ending === null) {
    return { name: "Broke", note: BROKE_CARD };
  }
  return ending;
};

export const CareerOver = ({
  career,
  onNewCareer,
  onClose,
}: {
  readonly career: CareerState | null;
  readonly onNewCareer: () => void;
  readonly onClose: () => void;
}) => {
  if (career === null) {
    return (
      <TextLinks>
        <TextButton onClick={onClose}>Close</TextButton>
      </TextLinks>
    );
  }
  const { name, note } = overOf(career);
  const { record } = career;
  return (
    <>
      <PanelTitle>{name}</PanelTitle>
      <PanelRule />
      <PanelLine>{note}</PanelLine>
      <dl
        aria-label="Record"
        className="flex flex-col gap-0.5 text-lg font-bold tracking-normal normal-case"
      >
        <RecordLine label="Reached" value={`Tier ${career.tier}`} />
        <RecordLine
          label="Races"
          value={`${plural(record.wins, "win", "wins")} in ${record.starts}`}
        />
        <RecordLine
          label="Knocked down"
          value={plural(record.knockdowns, "rider", "riders")}
        />
        <RecordLine
          label="Busted"
          value={plural(record.busts, "time", "times")}
        />
        <RecordLine label="Earned" value={formatMoney(record.earnings)} />
      </dl>
      <SkewButton
        detail="Back to tier 1 with a fresh bike."
        onClick={onNewCareer}
        title="New career"
        tone="primary"
      />
      <TextLinks>
        <TextButton onClick={onClose}>Close</TextButton>
      </TextLinks>
    </>
  );
};
