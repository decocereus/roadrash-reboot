import { practiceCareer, roadsFor } from "@racer/career/field";
import type { RoadStatus } from "@racer/career/field";
import type { CareerState } from "@racer/career/state";
import { levels } from "@racer/career/tables";
import type { Level, RoadId } from "@racer/career/tables";
import type { BikeId } from "@racer/sim/bikes";
import { roadAtLevel } from "@racer/track/road";
import { roads as roadPlans } from "@racer/track/roads";
import { Screen } from "@racer/ui/components/screen";

import { backRoomPlates, flyers, plates } from "../../assets/clubhouse-art.ts";
import { roadDescriptions, shortNames } from "../../career/copy.ts";
import type { QuickPick } from "../../career/flow.ts";
import { bikeName, kilometres } from "../../career/format.ts";
import { BarHeader, BarStrip } from "./bar-chrome.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { PinnedList } from "./pinned-list.tsx";
import { stepped, useEscape } from "./shared.tsx";

const BACKDROP = { h: 941, w: 1672, x: 0, y: 0 } as const;
const FLYER = { h: 556, w: 520, x: 1112, y: 104 } as const;
const FACTS = { h: 360, w: 500, x: 560, y: 470 } as const;
const FACTS_TEXT = { h: 210, w: 250, x: 615, y: 540 } as const;
const ABOUT = { h: 270, w: 456, x: 1150, y: 580 } as const;
const ABOUT_TEXT = { h: 175, w: 264, x: 1185, y: 634 } as const;

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

const Fact = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="flex items-baseline justify-between gap-[0.6em]">
    <dt className="text-paper/75">{label}</dt>
    <dd className="numeric text-right">{value}</dd>
  </div>
);

const RoadFacts = ({
  status,
  level,
}: {
  readonly status: RoadStatus;
  readonly level: Level;
}) => (
  <section aria-label="Road facts">
    <Plate box={FACTS} src={plates.noteCyan} />
    <dl
      className="font-display text-paper flex -rotate-3 flex-col justify-center gap-[0.35em] leading-none font-bold uppercase"
      style={{ ...place(FACTS_TEXT), fontSize: stagePx(20) }}
    >
      <Fact label="Length" value={`${kilometres(status.lengthMetres)} km`} />
      <Fact label="Traffic" value={trafficOf(status.road.id, level)} />
      <Fact label="Police" value={String(status.cops)} />
      <Fact label="Home of" value={homeOf(status)} />
    </dl>
  </section>
);

export const RouteBoardScreen = ({
  career,
  pick,
  ready,
  onPick,
  onRace,
  onBack,
}: {
  readonly career: CareerState | null;
  readonly pick: QuickPick;
  readonly ready: boolean;
  readonly onPick: (pick: QuickPick) => void;
  readonly onRace: () => void;
  readonly onBack: () => void;
}) => {
  const board = roadsFor(practiceCareer(pick, 0));
  const roadIds = board.roads.map((status) => status.road.id);
  const status =
    board.roads.find((each) => each.road.id === pick.roadId) ?? board.roads[0];
  const reached = levels.filter((level) => level <= (career?.level ?? 1));
  const owned: readonly BikeId[] = career?.garage ?? [pick.bikeId];
  useEscape(onBack);
  if (!status) {
    return null;
  }
  const nextRoad = (step: 1 | -1) => {
    onPick({ ...pick, roadId: stepped(roadIds, status.road.id, step) });
  };
  return (
    <Screen className="bg-ink flex" enter="fade">
      <Stage>
        <Plate
          box={BACKDROP}
          className="object-cover"
          src={backRoomPlates.backdrop}
        />
        <BarHeader career={career} />
        <button
          aria-label={`${status.road.name}. Show another road`}
          className="cursor-pointer"
          onClick={() => {
            nextRoad(1);
          }}
          style={place(FLYER)}
          tabIndex={-1}
          type="button"
        >
          <img
            alt=""
            className="seat-in pointer-events-none size-full object-contain select-none"
            decoding="async"
            draggable={false}
            key={status.road.id}
            src={flyers[status.road.id]}
          />
        </button>
        <RoadFacts level={board.level} status={status} />
        <Plate box={ABOUT} src={plates.noteMagenta} />
        <p
          className="font-display text-ink flex -rotate-2 items-center leading-tight font-bold"
          style={{ ...place(ABOUT_TEXT), fontSize: stagePx(18) }}
        >
          {roadDescriptions[status.road.id]}
        </p>
        <PinnedList
          actions={[
            {
              detail: ready ? undefined : "Loading the road",
              disabled: !ready,
              id: "race",
              label: "Race",
              run: onRace,
            },
            { id: "back", label: "Back", run: onBack },
          ]}
          autoFocus
          label="Route board"
          primary="race"
          steppers={[
            {
              id: "road",
              label: "Road",
              onStep: nextRoad,
              value: status.road.name,
            },
            {
              id: "level",
              label: "Level",
              onStep: (step) => {
                onPick({ ...pick, level: stepped(reached, pick.level, step) });
              },
              value: pick.level,
            },
            {
              id: "bike",
              label: "Bike",
              onStep: (step) => {
                onPick({ ...pick, bikeId: stepped(owned, pick.bikeId, step) });
              },
              value: bikeName(pick.bikeId),
            },
          ]}
          title="Single race"
        />
        <BarStrip>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            No money · Nothing to qualify
          </p>
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(22) }}
          >
            Left and right change the road, level, and bike
          </p>
        </BarStrip>
      </Stage>
    </Screen>
  );
};
