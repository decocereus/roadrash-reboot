import {
  angleOff,
  atTheGarageStand,
  holdPose,
  LOBBY_TICK,
  pullTheTaps,
  sendRiderTo,
  SHOVE,
  sitOnStool,
  standUp,
  startShove,
  stepLobbyRider,
  stoolNear,
  toggleBike,
} from "@racer/sim/lobby";
import type { LobbyControl, LobbyRider } from "@racer/sim/lobby";
import type { Spot } from "@racer/sim/lobby-floor";
import type { LobbyPose } from "@racer/sim/lobby-walk";
import type * as THREE from "three";

import type { BarSpot } from "../bar-view.ts";
import type { Bikes } from "./actors.ts";
import type { BarAction } from "./bar-input.ts";
import type { BarSpeech } from "./bar-speech.ts";
import type { BarWalker, WalkerStance, WalkerView } from "./bar-walker.ts";
import type { Puffs } from "./puffs.ts";

const GREET_FIRST = 1.4;
const REV_PUFF_SPEED = 9;
const REV_FADE = 0.8;
const REV_SPIN = 60;
const REV_SAG = 0.006;
const REV_SAG_RATE = 90;

export interface BarCompany {
  readonly crowd: () => readonly Spot[];
  readonly nearest: (x: number, z: number, reach: number) => number | null;
  readonly spotOf: (index: number) => Spot | null;
  readonly greet: (index: number, x: number, z: number, time: number) => void;
  readonly shove: (index: number, x: number, z: number, time: number) => void;
}

export interface PlayerSlot {
  readonly walker: BarWalker;
  readonly bike: THREE.Object3D;
  readonly bikeIndex: number;
}

interface PlayerParts {
  readonly bikes: Pick<Bikes, "sag" | "show" | "spin">;
  readonly company: BarCompany;
  readonly puffs: Pick<Puffs, "burst">;
  readonly rider: LobbyRider;
  readonly slot: () => PlayerSlot;
  readonly speech: Pick<BarSpeech, "say">;
  readonly walkUp: (spot: BarSpot) => void;
}

export interface BarPlayer {
  readonly view: WalkerView;
  readonly stance: () => WalkerStance;
  readonly act: (action: BarAction, time: number) => void;
  readonly pose: (pose: LobbyPose) => void;
  readonly walkTo: (x: number, z: number) => void;
  readonly advance: (
    seconds: number,
    control: LobbyControl,
    viewYaw: number,
    time: number
  ) => number;
}

const headingToward = (x: number, z: number): number =>
  Math.atan2(x, z) + Math.PI;

export const createBarPlayer = ({
  bikes,
  company,
  puffs,
  rider,
  slot,
  speech,
  walkUp,
}: PlayerParts): BarPlayer => {
  const blockers: Spot[] = [];
  const view: WalkerView = {
    heading: rider.heading,
    lean: 0,
    mounted: false,
    pace: 0,
    stride: 0,
    x: rider.x,
    z: rider.z,
  };
  let bikeOut = false;
  const parked = { heading: 0, x: 0, z: 0 };
  let backlog = 0;
  let fromX = rider.x;
  let fromZ = rider.z;
  let fromHeading = rider.heading;
  let fromLean = 0;
  let revving = 0;

  const shove = (time: number): void => {
    if (!startShove(rider)) {
      return;
    }
    const target = company.nearest(rider.x, rider.z, SHOVE.reach);
    const spot = target === null ? null : company.spotOf(target);
    if (target !== null && spot) {
      rider.heading = headingToward(spot.x - rider.x, spot.z - rider.z);
      company.shove(target, rider.x, rider.z, time);
    }
  };

  const greet = (time: number): void => {
    const target = company.nearest(rider.x, rider.z, SHOVE.reach);
    if (target !== null) {
      speech.say("YO", slot().walker.head, time);
      company.greet(target, rider.x, rider.z, time);
    }
  };

  const interact = (time: number): void => {
    if (rider.place.kind === "stool") {
      standUp(rider);
      return;
    }
    if (pullTheTaps(rider)) {
      speech.say("NICE! PRESS B FOR YOUR BIKE", slot().walker.head, time);
      return;
    }
    if (atTheGarageStand(rider)) {
      walkUp("garage");
      return;
    }
    if (rider.place.kind === "foot") {
      const seat =
        company.nearest(rider.x, rider.z, GREET_FIRST) === null
          ? stoolNear(rider, company.crowd())
          : null;
      if (seat !== null) {
        sitOnStool(rider, seat);
        return;
      }
    }
    greet(time);
  };

  const hopOnOrOff = (): void => {
    if (!toggleBike(rider)) {
      return;
    }
    const { bike } = slot();
    if (rider.place.kind === "bike") {
      bikeOut = true;
      bike.position.set(rider.x, 0, rider.z);
      bike.rotation.set(0, rider.heading, 0);
    } else {
      parked.x = bike.position.x;
      parked.z = bike.position.z;
      parked.heading = bike.rotation.y;
    }
    puffs.burst(bike, 1, REV_PUFF_SPEED);
  };

  const rev = (): void => {
    if (rider.place.kind === "bike") {
      revving = 1;
      puffs.burst(slot().bike, 1, REV_PUFF_SPEED);
    }
  };

  const act = (action: BarAction, time: number): void => {
    switch (action) {
      case "bike": {
        hopOnOrOff();
        break;
      }
      case "interact": {
        interact(time);
        break;
      }
      case "rev": {
        rev();
        break;
      }
      case "shove": {
        shove(time);
        break;
      }
      default: {
        action satisfies never;
      }
    }
  };

  const fillBlockers = (bike: THREE.Object3D): void => {
    blockers.length = 0;
    blockers.push(...company.crowd());
    if (bikeOut && rider.place.kind !== "bike") {
      blockers.push(bike.position);
    }
  };

  const advance: BarPlayer["advance"] = (seconds, control, viewYaw, time) => {
    const { bike, bikeIndex } = slot();
    if (bikeOut && rider.place.kind !== "bike") {
      bike.position.set(parked.x, 0, parked.z);
      bike.rotation.set(0, parked.heading, 0);
    }
    backlog += seconds;
    let ticks = 0;
    fillBlockers(bike);
    while (backlog >= LOBBY_TICK) {
      fromX = rider.x;
      fromZ = rider.z;
      fromHeading = rider.heading;
      fromLean = rider.lean;
      stepLobbyRider(rider, control, viewYaw, blockers);
      backlog -= LOBBY_TICK;
      ticks += 1;
    }
    const share = backlog / LOBBY_TICK;
    view.x = fromX + (rider.x - fromX) * share;
    view.z = fromZ + (rider.z - fromZ) * share;
    view.heading = fromHeading + angleOff(fromHeading, rider.heading) * share;
    view.lean = fromLean + (rider.lean - fromLean) * share;
    view.pace = rider.pace;
    view.stride = rider.stride;
    view.mounted = rider.place.kind === "bike";
    if (view.mounted) {
      bike.position.set(view.x, 0, view.z);
      bike.rotation.set(0, view.heading, view.lean);
      bikes.spin(bikeIndex, rider.pace * seconds);
    }
    revving = Math.max(0, revving - seconds * REV_FADE);
    bikes.spin(bikeIndex, revving * seconds * REV_SPIN);
    bikes.sag(bikeIndex, Math.sin(time * REV_SAG_RATE) * REV_SAG * revving);
    if (bikeOut) {
      bikes.show(bikeIndex);
    }
    return ticks;
  };

  return {
    act,
    advance,
    pose(pose) {
      holdPose(rider, pose);
    },
    stance: () => ({
      place: rider.place.kind,
      pose: rider.place.kind === "foot" ? rider.place.pose : null,
      shoving: rider.shoving,
    }),
    view,
    walkTo(x, z) {
      sendRiderTo(rider, x, z);
    },
  };
};
