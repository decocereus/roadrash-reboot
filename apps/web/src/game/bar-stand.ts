import { bikeDefinitions } from "@racer/content/bikes";
import { byId } from "@racer/content/rows";
import { bikeIds } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { atTheGarageStand } from "@racer/sim/lobby";
import { GARAGE_PLINTH } from "@racer/sim/lobby-floor";
import type { Spot } from "@racer/sim/lobby-floor";
import * as THREE from "three";

import type { BarSpot } from "../bar-view.ts";
import type { BikeRider, Bikes } from "./actors.ts";
import type { Tag, TagLayer } from "./bar-tags.ts";
import { bikeModelOf } from "./bike-models.ts";

const RESTING_YAW = 2.61;
const SWAY = 0.22;
const SHOWN_YAW = RESTING_YAW + 0.75;
const TURN_PER_PIXEL = 0.012;
const EASE = 3.6;
const PROMPT_LIFT = 0.2;
const TOUR_FRAMES = 90;
const TOUR_TURN = 1.4;
const TAU = Math.PI * 2;
const FIRST_STAND_BIKE = 1;

const showroomPaint: Readonly<Record<BikeId, number>> = byId(
  bikeDefinitions,
  ({ looks }) => looks.showroomPaint
);

export const standRiders: readonly BikeRider[] = bikeIds.map((bikeId) => ({
  model: bikeModelOf[bikeId],
  paint: showroomPaint[bikeId],
  police: false,
}));

export const FIRST_WALKER_BIKE = FIRST_STAND_BIKE + standRiders.length;

export interface StandView {
  readonly open: boolean;
  readonly bikeId: BikeId;
}

type ViewSize = Parameters<Tag["set"]>[2];

export interface GarageCorner {
  readonly mount: THREE.Object3D;
  readonly isOpen: () => boolean;
  readonly set: (next: StandView) => void;
  readonly turn: (pixels: number) => void;
  readonly tour: (frame: number) => void;
  readonly place: (seconds: number, clock: number, frame: number) => void;
  readonly offer: (
    rider: Spot,
    lift: number,
    head: THREE.Vector3,
    camera: THREE.Camera,
    size: ViewSize
  ) => void;
  readonly walkedUp: (spot: BarSpot) => void;
  readonly listen: (listener: ((spot: BarSpot) => void) | null) => void;
  readonly read: () => StandView & { readonly yaw: number };
}

export const createGarageCorner = (
  bikes: Bikes,
  tags: TagLayer
): GarageCorner => {
  const mount = new THREE.Object3D();
  mount.position.set(GARAGE_PLINTH.x, GARAGE_PLINTH.height, GARAGE_PLINTH.z);
  const prompt = tags.prompt("Garage", "E");
  const promptAt = new THREE.Vector3();
  let view: StandView = { bikeId: "halden-wren-400", open: false };
  let yaw = RESTING_YAW;
  let shown = 0;
  let tourFrom: number | null = null;
  let listener: ((spot: BarSpot) => void) | null = null;

  const set = (next: StandView): void => {
    if (next.open && !view.open) {
      yaw = SHOWN_YAW;
    }
    view = next;
  };

  const touring = (seconds: number, frame: number): void => {
    if (tourFrom === null) {
      return;
    }
    const at = Math.floor((frame - tourFrom) / TOUR_FRAMES) % bikeIds.length;
    view = { bikeId: bikeIds[at] ?? view.bikeId, open: true };
    yaw += seconds * TOUR_TURN;
  };

  return {
    isOpen: () => view.open,
    listen(next) {
      listener = next;
    },
    mount,
    offer(rider, lift, head, camera, size) {
      const offered =
        listener !== null &&
        !view.open &&
        lift === 0 &&
        atTheGarageStand(rider);
      prompt.show(offered);
      if (offered) {
        promptAt.copy(head);
        promptAt.y += PROMPT_LIFT;
        prompt.set(promptAt, camera, size);
      }
    },
    place(seconds, clock, frame) {
      touring(seconds, frame);
      shown += (Number(view.open) - shown) * (1 - Math.exp(-EASE * seconds));
      const sway = RESTING_YAW + Math.sin(clock * 0.25) * SWAY;
      const turned = yaw - sway;
      mount.rotation.y =
        sway + (turned - Math.round(turned / TAU) * TAU) * shown;
      const slot = FIRST_STAND_BIKE + bikeIds.indexOf(view.bikeId);
      const bike = bikes.roots[slot];
      if (bike) {
        bike.position.copy(mount.position);
        bike.rotation.copy(mount.rotation);
        bikes.show(slot);
      }
    },
    read: () => ({ ...view, yaw }),
    set,
    tour(frame) {
      tourFrom = frame;
      set({ bikeId: view.bikeId, open: true });
    },
    turn(pixels) {
      yaw += pixels * TURN_PER_PIXEL;
    },
    walkedUp(spot) {
      if (!view.open) {
        listener?.(spot);
      }
    },
  };
};
