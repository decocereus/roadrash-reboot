import type { RaceOutcome } from "@racer/career/outcome";
import { billConsequence } from "@racer/career/settle";
import type { CareerState } from "@racer/career/state";
import { repairBill } from "@racer/career/tables";
import { bikes } from "@racer/sim/bikes";
import { Invoice } from "@racer/ui/components/invoice";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";

import { billWarning, classNames, magsLine } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import { ActionMenu, SmallPrint } from "./shared.tsx";

export const WreckedScreen = ({
  career,
  outcome,
  onPay,
}: {
  readonly career: CareerState;
  readonly outcome: RaceOutcome;
  readonly onPay: () => void;
}) => {
  const bill = repairBill(outcome.level, career.bikeId);
  const bike = bikeName(career.bikeId);
  return (
    <Screen>
      <ScreenBody className="flex items-end justify-between gap-10">
        <div className="flex max-w-xl flex-col gap-6 pb-6">
          <Stencil rotate={-4}>Wrecked</Stencil>
          <div>
            <p className="text-quote font-semibold text-pretty">
              “{magsLine(outcome.raceId)}”
            </p>
            <SmallPrint>Mags, with a crowbar and a toothpick</SmallPrint>
          </div>
        </div>
        <Invoice
          amount={bill}
          cashAfter={career.cash - bill}
          className="mb-6"
          detail={`Level ${outcome.level} · ${classNames[bikes[career.bikeId].bikeClass]}`}
          item={`Repair, ${bike}`}
          warning={billWarning(billConsequence(career, bill), "bill", bike)}
        />
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <SmallPrint>
          {outcome.km.toFixed(1)} km into the race, the bike gave up
        </SmallPrint>
        <ActionMenu
          actions={[{ id: "pay", label: "Pay up", run: onPay }]}
          label="Wrecked"
          primary="pay"
        />
      </ScreenStrip>
    </Screen>
  );
};
