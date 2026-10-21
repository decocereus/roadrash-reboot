import { preRaceLine } from "@racer/career/lines";
import type { CareerState } from "@racer/career/state";
import { ALLY, roads } from "@racer/career/tables";
import { CorkBoard } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import { Panel } from "@racer/ui/components/panel";
import { Postcard } from "@racer/ui/components/postcard";
import { RegionScene } from "@racer/ui/components/region-scene";
import { RiderCard } from "@racer/ui/components/rider-card";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";

import { riderColours } from "../../career/colours.ts";
import { roadDescriptions, shortNames } from "../../career/copy.ts";
import {
  copCount,
  kilometres,
  shortBike,
  weaponLabel,
} from "../../career/format.ts";
import type { RacePlan } from "../../game/hud.ts";
import { ActionMenu, SmallPrint, standingTag, useEscape } from "./shared.tsx";

const carrying = (plan: RacePlan): string => {
  const { weapon, weaponHits } = plan.setup.player;
  return weapon === "none"
    ? "Nothing"
    : `${weaponLabel(weapon)} (${weaponHits} ${weaponHits === 1 ? "hit" : "hits"} left)`;
};

const kitOf = (bike: string, weapon: string): string =>
  weapon === "" ? shortBike(bike) : `${shortBike(bike)} · ${weapon}`;

export const PreRaceScreen = ({
  plan,
  career,
  ready,
  onStart,
  onBack,
}: {
  readonly plan: RacePlan;
  readonly career: CareerState | null;
  readonly ready: boolean;
  readonly onStart: () => void;
  readonly onBack: () => void;
}) => {
  const { setup } = plan;
  const road = roads[setup.roadId];
  const quick = plan.mode === "quick";
  const speaker = career && !quick ? preRaceLine(career, setup) : null;
  useEscape(onBack);
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">
          {road.name} · Level {setup.level}
        </Heading>
        <SmallPrint>
          {kilometres(setup.track.length)} km · {copCount(setup.police.count)} ·{" "}
          {quick ? "Single race" : "Top 3 qualifies"}
        </SmallPrint>
      </ScreenStrip>
      <ScreenBody className="grid grid-cols-[1fr_1.25fr] gap-8 overflow-y-auto">
        <CorkBoard className="flex flex-col items-center justify-center gap-6 p-6">
          <Postcard
            caption={road.regionName}
            className="w-[min(24rem,100%)]"
            scene={<RegionScene region={road.region} />}
            size="lg"
            tilt={-2}
            title={road.name}
          />
          <p className="text-ink max-w-md text-center font-semibold text-pretty">
            {roadDescriptions[road.id]}
          </p>
        </CorkBoard>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {setup.field.map((rival, slot) => {
              const entrant = setup.rivals[slot];
              if (!entrant) {
                return null;
              }
              const ally =
                !quick && rival === ALLY && career?.story.deeAlly === true;
              const grudge = !quick && career?.memory[rival].grudge === true;
              return (
                <RiderCard
                  colours={riderColours(entrant)}
                  grid={slot + 1}
                  home={kitOf(entrant.bike.name, weaponLabel(entrant.weapon))}
                  key={rival}
                  layout="row"
                  name={shortNames[rival]}
                  speaking={speaker?.rival === rival}
                  tag={standingTag(ally, grudge)}
                />
              );
            })}
            <RiderCard
              colours={riderColours(setup.player)}
              grid={setup.field.length + 1}
              home={kitOf(
                setup.player.bike.name,
                weaponLabel(setup.player.weapon)
              )}
              layout="row"
              name="You"
              you
            />
          </div>
          {speaker && (
            <Panel tone="raised">
              <Heading as="p" size="sm" tone="muted">
                {shortNames[speaker.rival]}
              </Heading>
              <p className="text-quote mt-1 font-semibold text-pretty">
                “{speaker.text}”
              </p>
            </Panel>
          )}
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <div className="flex flex-wrap gap-x-10 gap-y-2">
          <Stat label="You" size="sm" value={setup.player.bike.name} />
          <Stat label="Carrying" size="sm" value={carrying(plan)} />
        </div>
        <ActionMenu
          actions={[
            { id: "back", label: "Back", run: onBack },
            {
              detail: ready ? undefined : "Loading the road",
              disabled: !ready,
              id: "start",
              label: "Start",
              run: onStart,
            },
          ]}
          label="Pre-race"
          primary="start"
        />
      </ScreenStrip>
    </Screen>
  );
};
