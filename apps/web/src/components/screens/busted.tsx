import { roads } from "@racer/career/tables";
import { officers } from "@racer/sim/cast";
import { Heading } from "@racer/ui/components/heading";
import { RiderPortrait } from "@racer/ui/components/rider-card";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";
import { Ticket } from "@racer/ui/components/ticket";

import { riderColours } from "../../career/colours.ts";
import { OFFENCE } from "../../career/copy.ts";
import type { RaceReport } from "../../career/flow.ts";
import { bikeName, weaponLabel } from "../../career/format.ts";
import { ActionMenu, SmallPrint } from "./shared.tsx";

const SERIAL_DIGITS = 5;

const warningOf = (report: RaceReport): string | undefined => {
  if (report.ledger?.gameOver === true) {
    return "This fine ends the career.";
  }
  return report.ledger?.repossessed
    ? `This fine takes the ${bikeName(report.ledger.repossessed.bikeId)}.`
    : undefined;
};

export function BustedScreen({
  report,
  onPay,
}: {
  readonly report: RaceReport;
  readonly onPay: () => void;
}) {
  const { bust } = report.summary;
  if (!(bust && report.ledger)) {
    return null;
  }
  const { ledger } = report;
  return (
    <Screen
      scene={
        <div className="from-blue/35 via-ink to-red/25 size-full bg-linear-to-r" />
      }
    >
      <ScreenBody className="grid grid-cols-[1fr_2fr] items-center gap-10">
        <RiderPortrait
          className="border-line h-[60%] border-2"
          colours={riderColours(officers[bust.officer].profile)}
        />
        <div className="flex flex-col items-start gap-5">
          <Stencil rotate={-2} tone="police">
            Busted
          </Stencil>
          <div>
            <Heading as="h2" size="md" tone="text">
              {bust.officerName}
            </Heading>
            <p className="text-quote mt-1 font-semibold text-pretty">
              “{bust.line}”
            </p>
          </div>
          <Ticket
            cashAfter={ledger.cashBefore - ledger.fine}
            confiscated={
              bust.weapon === "none"
                ? undefined
                : `Also confiscated: one ${weaponLabel(bust.weapon).toLowerCase()}.`
            }
            fine={bust.fine}
            location={`${roads[report.roadId].name}, km ${bust.km.toFixed(1)}`}
            offence={OFFENCE}
            serial={String(report.summary.raceId).padStart(SERIAL_DIGITS, "0")}
            warning={warningOf(report)}
          />
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <SmallPrint>Fines are never reduced</SmallPrint>
        <ActionMenu
          actions={[{ id: "pay", label: "Pay the fine", run: onPay }]}
          label="Busted"
          primary="pay"
        />
      </ScreenStrip>
    </Screen>
  );
}
