import type { LevelUp } from "@racer/career/settle";
import { policeLevels, roadList } from "@racer/career/tables";
import { LEVEL_EXTENSION } from "@racer/track/road";
import { CorkBoard, CorkNote } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import { formatMoney } from "@racer/ui/components/money";
import { Postcard } from "@racer/ui/components/postcard";
import { RegionScene } from "@racer/ui/components/region-scene";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { Stencil } from "@racer/ui/components/stencil";

import { firstPrize, levelName, vicCard } from "../../career/copy.ts";
import { bikeName, kilometres } from "../../career/format.ts";
import { ActionMenu } from "./shared.tsx";

const tilts = [-5, 3, -2, 4, -3] as const;

export const LevelUpScreen = ({
  levelUp,
  onDone,
}: {
  readonly levelUp: LevelUp;
  readonly onDone: () => void;
}) => {
  const { level, bikes } = levelUp;
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">Level {level}</Heading>
        <Heading as="p" size="md" tone="text">
          {levelName(level)}
        </Heading>
      </ScreenStrip>
      <ScreenBody className="overflow-y-auto">
        <CorkBoard className="flex min-h-full flex-col items-center justify-center gap-8 p-6">
          <div className="flex justify-center pl-16">
            {roadList.map((road, index) => (
              <Postcard
                className="-ml-16"
                key={road.id}
                scene={<RegionScene region={road.region} />}
                size="sm"
                stamp={
                  <Stencil framed rotate={-12} size="sm">
                    Qualified
                  </Stencil>
                }
                tilt={tilts[index] ?? 0}
                title={road.name}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-start justify-center gap-10">
            <CorkNote hand="typed" pin="green" signature="V." tilt={-1}>
              {vicCard(level)}
            </CorkNote>
            <CorkNote hand="typed" pin="yellow" tilt={1.5}>
              <span className="flex flex-col gap-2">
                <Stat
                  label="Roads"
                  layout="row"
                  size="sm"
                  tone="ink"
                  value={`+${kilometres(LEVEL_EXTENSION)} km`}
                />
                <Stat
                  label="Police"
                  layout="row"
                  size="sm"
                  tone="ink"
                  value={policeLevels[level].count}
                />
                <Stat
                  label="1st place now pays"
                  layout="row"
                  size="sm"
                  tone="ink"
                  value={formatMoney(firstPrize(level))}
                />
                {bikes.length > 0 && (
                  <Stat
                    label="New at the garage"
                    layout="row"
                    size="sm"
                    tone="ink"
                    value={bikes.map((bikeId) => bikeName(bikeId)).join(", ")}
                  />
                )}
              </span>
            </CorkNote>
          </div>
        </CorkBoard>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <span />
        <ActionMenu
          actions={[{ id: "done", label: "Back to the Lowside", run: onDone }]}
          label="Level up"
          primary="done"
        />
      </ScreenStrip>
    </Screen>
  );
};
