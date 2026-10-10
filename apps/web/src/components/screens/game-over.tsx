import type { CareerState } from "@racer/career/state";
import { endings } from "@racer/career/story";
import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { CorkNote } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import { formatMoney } from "@racer/ui/components/money";
import { Panel } from "@racer/ui/components/panel";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { Stencil } from "@racer/ui/components/stencil";

import { BROKE_CARD } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import { ActionMenu, SmallPrint, useEscape } from "./shared.tsx";

const bestBike = (garage: readonly BikeId[]): string => {
  const [best] = garage.toSorted(
    (left, right) => bikes[right].price - bikes[left].price
  );
  return best === undefined ? "" : bikeName(best);
};

function Record({
  career,
  money,
}: {
  readonly career: CareerState;
  readonly money: boolean;
}) {
  const { record } = career;
  return (
    <Panel className="grid w-[26rem] max-w-full grid-cols-2 gap-x-8 gap-y-4">
      <Stat label="Reached" size="sm" value={`Level ${career.level}`} />
      <Stat
        label="Races"
        size="sm"
        value={`${record.starts} · ${record.wins} ${record.wins === 1 ? "win" : "wins"}`}
      />
      <Stat
        label="Knocked down"
        size="sm"
        value={`${record.knockdowns} ${record.knockdowns === 1 ? "rider" : "riders"}`}
      />
      <Stat
        label="Busted"
        size="sm"
        value={`${record.busts} ${record.busts === 1 ? "time" : "times"}`}
      />
      {money ? (
        <Stat
          label="Money earned"
          size="sm"
          tone="green"
          value={formatMoney(record.earnings)}
        />
      ) : (
        <Stat label="Best bike" size="sm" value={bestBike(career.garage)} />
      )}
    </Panel>
  );
}

export function GameOverScreen({
  career,
  onNewCareer,
  onTitle,
}: {
  readonly career: CareerState;
  readonly onNewCareer: () => void;
  readonly onTitle: () => void;
}) {
  useEscape(onTitle);
  return (
    <Screen className="[animation-duration:600ms]" enter="fade">
      <ScreenBody className="flex flex-col justify-center gap-8">
        <Stencil rotate={-3}>Broke</Stencil>
        <div className="flex flex-wrap items-start gap-10">
          <CorkNote hand="typed" pin="none" signature="V." tilt={-1}>
            {BROKE_CARD}
          </CorkNote>
          <Record career={career} money={false} />
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <SmallPrint>The Lowside car park, after closing</SmallPrint>
        <ActionMenu
          actions={[
            { id: "title", label: "Title", run: onTitle },
            { id: "new", label: "New career", run: onNewCareer },
          ]}
          className="gap-x-12"
          label="Game over"
          primary="new"
        />
      </ScreenStrip>
    </Screen>
  );
}

export function EndingScreen({
  career,
  onTitle,
}: {
  readonly career: CareerState;
  readonly onTitle: () => void;
}) {
  const ending = career.story.ending ? endings[career.story.ending] : null;
  useEscape(onTitle);
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">{ending?.name ?? "The Long Ridge"}</Heading>
        <SmallPrint>The season is over</SmallPrint>
      </ScreenStrip>
      <ScreenBody className="flex flex-wrap items-start gap-10 overflow-y-auto">
        <p className="text-quote max-w-2xl font-semibold text-pretty">
          {ending?.note}
        </p>
        <Record career={career} money />
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <span />
        <ActionMenu
          actions={[{ id: "title", label: "Back to title", run: onTitle }]}
          label="Ending"
          primary="title"
        />
      </ScreenStrip>
    </Screen>
  );
}
