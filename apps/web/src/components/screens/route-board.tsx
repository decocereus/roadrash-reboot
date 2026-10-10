import { roadsFor } from "@racer/career/field";
import type { RoadBoard, RoadStatus } from "@racer/career/field";
import type { CareerState } from "@racer/career/state";
import { levels } from "@racer/career/tables";
import type { Level, RoadId } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";
import { roadAtLevel } from "@racer/track/road";
import { roads as roadPlans } from "@racer/track/roads";
import { CorkBoard } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import {
  MenuItem,
  MenuList,
  MenuStepper,
} from "@racer/ui/components/menu-list";
import { formatMoney } from "@racer/ui/components/money";
import { Panel } from "@racer/ui/components/panel";
import { Postcard } from "@racer/ui/components/postcard";
import { RegionScene } from "@racer/ui/components/region-scene";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { Stencil } from "@racer/ui/components/stencil";

import {
  FINALE_LOCK,
  REPEAT_RUN,
  roadDescriptions,
  shortNames,
} from "../../career/copy.ts";
import { practiceCareer } from "../../career/flow.ts";
import type { QuickPick } from "../../career/flow.ts";
import { bikeName, kilometres, ordinal } from "../../career/format.ts";
import type { RaceMode } from "../../game/hud.ts";
import { sidewaysStep, SmallPrint, stepped, useEscape } from "./shared.tsx";

const tilts = [-3, 2, -1.5, 3, -2] as const;
const STEADY_TRAFFIC = 6;
const HEAVY_TRAFFIC = 10;

const trafficOf = (roadId: RoadId, level: Level): string => {
  const perKm = roadAtLevel(roadPlans[roadId], level).trafficPerKilometre;
  if (perKm >= HEAVY_TRAFFIC) {
    return "Heavy";
  }
  return perKm >= STEADY_TRAFFIC ? "Steady" : "Light";
};

const homeOf = (status: RoadStatus): string =>
  status.home.map((rival) => shortNames[rival]).join(" and ");

function RoadCard({
  status,
  mode,
  tilt,
  selected,
  onPick,
}: {
  readonly status: RoadStatus;
  readonly mode: RaceMode;
  readonly tilt: number;
  readonly selected: boolean;
  readonly onPick: () => void;
}) {
  const career = mode === "career";
  return (
    <button
      aria-pressed={selected}
      className="rounded-sm"
      onClick={onPick}
      tabIndex={-1}
      type="button"
    >
      <Postcard
        caption={status.road.regionName}
        className="w-[min(13rem,17vw)]"
        scene={<RegionScene region={status.road.region} />}
        selected={selected}
        stamp={
          career && status.qualified ? (
            <Stencil framed rotate={-12} size="md">
              Qualified · {ordinal(status.bestPlace)}
            </Stencil>
          ) : career && !status.open ? (
            <Stencil framed rotate={-8} size="md" tone="ink">
              Locked
            </Stencil>
          ) : undefined
        }
        tilt={tilt}
        title={status.road.name}
      />
    </button>
  );
}

function RoadNotes({
  status,
  mode,
}: {
  readonly status: RoadStatus;
  readonly mode: RaceMode;
}) {
  return (
    <Panel className="flex flex-col gap-2">
      <Heading as="h2" size="md" tone="text">
        {status.road.name}
      </Heading>
      <p className="text-pretty">{roadDescriptions[status.road.id]}</p>
      {mode === "career" && status.qualified && (
        <SmallPrint>{REPEAT_RUN}</SmallPrint>
      )}
      {mode === "career" && !status.open && (
        <p className="text-label text-red font-semibold uppercase">
          {FINALE_LOCK}
        </p>
      )}
    </Panel>
  );
}

const boardFor = (
  mode: RaceMode,
  career: CareerState | null,
  pick: QuickPick
): RoadBoard =>
  roadsFor(mode === "career" && career ? career : practiceCareer(pick, 0));

export function RouteBoardScreen({
  mode,
  career,
  pick,
  ready,
  onPick,
  onRace,
  onBack,
}: {
  readonly mode: RaceMode;
  readonly career: CareerState | null;
  readonly pick: QuickPick;
  readonly ready: boolean;
  readonly onPick: (pick: QuickPick) => void;
  readonly onRace: () => void;
  readonly onBack: () => void;
}) {
  const board = boardFor(mode, career, pick);
  const roadIds = board.roads.map((status) => status.road.id);
  const status =
    board.roads.find((each) => each.road.id === pick.roadId) ?? board.roads[0];
  const reached = levels.filter((level) => level <= (career?.level ?? 1));
  const owned: readonly BikeId[] = career?.garage ?? [pick.bikeId];
  const quick = mode === "quick";
  useEscape(onBack);
  if (!status) {
    return null;
  }
  const open = quick || status.open;
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">Route board</Heading>
        <SmallPrint>
          {quick
            ? "Single race · No money · Nothing to qualify"
            : `Level ${board.level} · Qualify all five · Top 3 counts`}
        </SmallPrint>
      </ScreenStrip>
      <ScreenBody className="flex flex-col gap-5 overflow-y-auto">
        <CorkBoard className="flex flex-1 flex-wrap content-center items-center justify-center gap-5 px-5 py-8">
          {board.roads.map((each, index) => (
            <RoadCard
              key={each.road.id}
              mode={mode}
              onPick={() => onPick({ ...pick, roadId: each.road.id })}
              selected={each.road.id === status.road.id}
              status={each}
              tilt={tilts[index] ?? 0}
            />
          ))}
        </CorkBoard>
        <div className="grid grid-cols-[1fr_auto] items-end gap-10">
          <RoadNotes mode={mode} status={status} />
          <MenuList
            autoFocus
            className="min-w-56"
            defaultValue="race"
            label="Route board"
            onKeyDown={(event) => {
              const step = sidewaysStep(event.key);
              const onStepper =
                event.target instanceof HTMLElement &&
                event.target.dataset.stepper !== undefined;
              if (step !== 0 && !onStepper) {
                event.preventDefault();
                onPick({
                  ...pick,
                  roadId: stepped(roadIds, status.road.id, step),
                });
              }
            }}
            onSelect={(value) => {
              if (value === "race") {
                onRace();
              }
              if (value === "back") {
                onBack();
              }
            }}
          >
            {quick && (
              <MenuStepper
                label="Level"
                onStep={(step) =>
                  onPick({ ...pick, level: stepped(reached, pick.level, step) })
                }
                value="level"
              >
                {pick.level}
              </MenuStepper>
            )}
            {quick && (
              <MenuStepper
                label="Bike"
                onStep={(step) =>
                  onPick({ ...pick, bikeId: stepped(owned, pick.bikeId, step) })
                }
                value="bike"
              >
                {bikeName(pick.bikeId)}
              </MenuStepper>
            )}
            <MenuItem
              detail={ready ? undefined : "Loading the road"}
              disabled={!(open && ready)}
              value="race"
            >
              Race
            </MenuItem>
            <MenuItem value="back">Back</MenuItem>
          </MenuList>
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom">
        <Stat
          label="Length"
          size="sm"
          value={`${kilometres(status.lengthMetres)} km`}
        />
        <Stat
          label="Traffic"
          size="sm"
          value={trafficOf(status.road.id, board.level)}
        />
        <Stat label="Police" size="sm" value={status.cops} />
        {!quick && (
          <Stat
            label="Prize for 1st"
            size="sm"
            tone="green"
            value={formatMoney(status.firstPrize)}
          />
        )}
        <Stat label="Home of" size="sm" value={homeOf(status)} />
      </ScreenStrip>
    </Screen>
  );
}
