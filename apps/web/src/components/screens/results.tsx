import type { ResultRow } from "@racer/career/result";
import type { Ledger as RaceLedger } from "@racer/career/settle";
import { creditLimitOf, roads } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";
import { rivals } from "@racer/sim/cast";
import { defaultPlayer } from "@racer/sim/race";
import { AdSlot } from "@racer/ui/components/ad-slot";
import { Heading } from "@racer/ui/components/heading";
import { Ledger, LedgerRow, LedgerTotal } from "@racer/ui/components/ledger";
import { formatMoney } from "@racer/ui/components/money";
import { Panel } from "@racer/ui/components/panel";
import { RiderRow, RiderRows } from "@racer/ui/components/rider-card";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";

import { bikeColour } from "../../career/colours.ts";
import { shortNames } from "../../career/copy.ts";
import type { RaceReport } from "../../career/flow.ts";
import { bikeName, ordinal, raceTime, shortBike } from "../../career/format.ts";
import { incidentLines } from "../../career/notes.ts";
import { ActionMenu, SmallPrint } from "./shared.tsx";
import type { MenuAction } from "./shared.tsx";

const outcomeOf = (report: RaceReport): string => {
  if (report.result === "busted") {
    return "Busted";
  }
  if (report.result !== "finished") {
    return "Wrecked";
  }
  if (!report.ledger) {
    return ordinal(report.place);
  }
  return `${ordinal(report.place)} · ${
    report.ledger.qualified || report.ledger.repeat
      ? "Qualified"
      : "Not qualified"
  }`;
};

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
    return behind === 0 && reference > 0 ? "Leading" : `+ ${behind} m`;
  }
  return row.fate === "busted" ? "Busted" : "Wrecked";
};

const prizeLabel = (ledger: RaceLedger): string => {
  if (ledger.result !== "finished") {
    return "Prize";
  }
  if (!ledger.repeat) {
    return `Prize, ${ordinal(ledger.place)}`;
  }
  return ledger.prize > 0
    ? `Prize, ${ordinal(ledger.place)} · Repeat run, half pay`
    : "Repeat run · No pay below 3rd";
};

const repossessionText = (ledger: RaceLedger): string | null => {
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

const Money = ({
  ledger,
  riding,
}: {
  readonly ledger: RaceLedger;
  readonly riding: BikeId;
}) => {
  const debt = Math.max(0, -ledger.cashAfter);
  const taken = repossessionText(ledger);
  return (
    <Panel className="flex flex-col gap-3">
      <Ledger>
        <LedgerRow amount={ledger.prize} label={prizeLabel(ledger)} />
        <LedgerRow
          amount={-ledger.repair}
          label={
            ledger.repairHalved
              ? "Repairs · Half, thanks to our sponsor"
              : "Repairs"
          }
        />
        <LedgerRow amount={-ledger.fine} label="Fines" />
        {ledger.envelope !== 0 && (
          <LedgerRow amount={ledger.envelope} label="Vic's envelope" />
        )}
        <LedgerTotal
          amount={ledger.cashAfter}
          label={ledger.cashAfter < 0 ? "Owed" : "Cash"}
        />
      </Ledger>
      {ledger.qualified && (
        <p className="text-label text-yellow font-semibold uppercase">
          {ledger.qualifiedCount} / 5 roads qualified
        </p>
      )}
      {taken !== null && (
        <p className="text-label text-red font-semibold uppercase">{taken}</p>
      )}
      {ledger.gameOver && (
        <p className="text-label text-red font-semibold uppercase">
          You owe {formatMoney(debt)} on a Gutter Pup. Vic wants a word.
        </p>
      )}
      {debt > 0 && !ledger.gameOver && (
        <p className="text-label text-red font-semibold uppercase">
          You owe {formatMoney(debt)}. Limit{" "}
          {formatMoney(creditLimitOf(riding))}. Past that, the garage takes the
          bike.
        </p>
      )}
    </Panel>
  );
};

export const ResultsScreen = ({
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
}) => {
  const { rows } = report.summary;
  const reference = gapFrom(rows);
  const notes = incidentLines(report.summary.incidents);
  const career = report.ledger !== null;
  const actions: MenuAction[] = [
    ...(canRaceAgain
      ? [
          {
            detail: repeatRun ? "Repeat run: half pay" : undefined,
            id: "again",
            label: "Race again",
            run: onRaceAgain,
          },
        ]
      : []),
    { id: "continue", label: "Continue", run: onContinue },
  ];
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">
          Results · {roads[report.roadId].name} · Level {report.level}
        </Heading>
        <Heading
          as="p"
          size="md"
          tone={report.result === "finished" ? "yellow" : "red"}
        >
          {outcomeOf(report)}
        </Heading>
      </ScreenStrip>
      <ScreenBody className="grid grid-cols-[1.5fr_1fr] items-start gap-6 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <Panel padding="sm">
            {rows.length === 0 ? (
              <p className="text-muted p-3">
                You left before the race was run. Nobody was classified.
              </p>
            ) : (
              <RiderRows>
                {rows.map((row) => {
                  const you = row.racer === "player";
                  const profile =
                    row.racer === "player" ? defaultPlayer : rivals[row.racer];
                  return (
                    <RiderRow
                      bike={shortBike(bikeName(row.bikeId))}
                      colour={bikeColour(profile.paint)}
                      key={row.racer}
                      name={
                        row.racer === "player" ? "You" : shortNames[row.racer]
                      }
                      note={
                        notes.find((note) => note.racer === row.racer)?.text
                      }
                      place={row.place}
                      prize={career ? row.prize : undefined}
                      result={resultOf(row, reference)}
                      you={you}
                    />
                  );
                })}
              </RiderRows>
            )}
          </Panel>
          {career && <AdSlot className="self-center" />}
        </div>
        <div className="flex flex-col gap-4">
          {report.ledger && <Money ledger={report.ledger} riding={riding} />}
          {report.line && (
            <Panel tone="raised">
              <Heading as="p" size="sm" tone="muted">
                {shortNames[report.line.rival]}
              </Heading>
              <p className="text-quote mt-1 font-semibold text-pretty">
                “{report.line.text}”
              </p>
            </Panel>
          )}
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <SmallPrint>
          {career ? "Settled and saved" : "Nothing is written to the career"}
        </SmallPrint>
        <ActionMenu
          actions={actions}
          className="gap-x-12"
          label="Results"
          primary="continue"
        />
      </ScreenStrip>
    </Screen>
  );
};
