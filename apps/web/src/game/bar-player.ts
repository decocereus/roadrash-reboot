import {
  angleOff,
  createLobbyRider,
  holdPose,
  LOBBY_TICK,
  pullTheTaps,
  respawnRider,
  sendRiderTo,
  SHOVE,
  sitOnStool,
  standUp,
  startShove,
  stepLobbyRider,
  stoolNear,
  toggleBike,
} from "@racer/sim/lobby";
import type { LobbyControl, LobbyPose } from "@racer/sim/lobby";
import type * as THREE from "three";

import type { Bikes } from "./actors.ts";
import type { BarCast } from "./bar-cast.ts";
import type { BarAction } from "./bar-input.ts";
import type { BarSpeech } from "./bar-speech.ts";
import type { BarYou, YouView } from "./bar-you.ts";
import type { Puffs } from "./puffs.ts";

const GREET_FIRST = 1.4;
const REV_PUFF_SPEED = 9;
const REV_FADE = 0.8;
const REV_SPIN = 60;
const REV_SAG = 0.006;
const REV_SAG_RATE = 90;

interface PlayerParts {
  readonly cast: BarCast;
  readonly speech: BarSpeech;
  readonly you: BarYou;
  readonly bikes: Bikes;
  readonly bikeIndex: number;
  readonly bike: THREE.Object3D;
  readonly puffs: Puffs;
}

export interface BarPlayer {
  readonly view: YouView;
  readonly rider: ReturnType<typeof createLobbyRider>;
  readonly act: (action: BarAction, time: number) => void;
  readonly pose: (pose: LobbyPose) => void;
  readonly walkTo: (x: number, z: number) => void;
  readonly advance: (
    seconds: number,
    control: LobbyControl,
    viewYaw: number,
    time: number
  ) => number;
  readonly reset: () => void;
}

const headingToward = (x: number, z: number): number =>
  Math.atan2(x, z) + Math.PI;

export const createBarPlayer = ({
  bike,
  bikeIndex,
  bikes,
  cast,
  puffs,
  speech,
  you,
}: PlayerParts): BarPlayer => {
  const rider = createLobbyRider();
  const others = [...cast.crowd];
  const othersAndBike = [...cast.crowd, bike.position];
  const view: YouView = {
    heading: rider.heading,
    lean: 0,
    mounted: false,
    pace: 0,
    stride: 0,
    x: rider.x,
    z: rider.z,
  };
  let bikeOut = false;
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
    const target = cast.nearest(rider.x, rider.z, SHOVE.reach);
    const body = target === null ? null : cast.members[target];
    if (target === null || !body) {
      return;
    }
    const { position } = body.figure.root;
    rider.heading = headingToward(position.x - rider.x, position.z - rider.z);
    cast.shove(target, rider.x, rider.z);
    cast.face(target, rider.x, rider.z, time);
    speech.say(target % 2 === 0 ? "WATCH IT!" : "OI!", body.head, time);
  };

  const greet = (time: number): boolean => {
    const target = cast.nearest(rider.x, rider.z, SHOVE.reach);
    const body = target === null ? null : cast.members[target];
    if (target === null || !body) {
      return false;
    }
    cast.face(target, rider.x, rider.z, time);
    speech.say("YO", you.head, time);
    speech.say("SUP", body.head, time);
    return true;
  };

  const interact = (time: number): void => {
    if (rider.place.kind === "stool") {
      standUp(rider);
      return;
    }
    if (pullTheTaps(rider)) {
      speech.say("NICE! PRESS B FOR YOUR BIKE", you.head, time);
      return;
    }
    if (rider.place.kind === "foot") {
      const seat =
        cast.nearest(rider.x, rider.z, GREET_FIRST) === null
          ? stoolNear(rider, others)
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
    if (rider.place.kind === "bike") {
      bikeOut = true;
      bike.position.set(rider.x, 0, rider.z);
      bike.rotation.set(0, rider.heading, 0);
    } else {
      bike.rotation.z = 0;
    }
    puffs.burst(bike, 1, REV_PUFF_SPEED);
  };

  const rev = (): void => {
    if (rider.place.kind === "bike") {
      revving = 1;
      puffs.burst(bike, 1, REV_PUFF_SPEED);
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

  const advance: BarPlayer["advance"] = (seconds, control, viewYaw, time) => {
    backlog += seconds;
    let ticks = 0;
    while (backlog >= LOBBY_TICK) {
      fromX = rider.x;
      fromZ = rider.z;
      fromHeading = rider.heading;
      fromLean = rider.lean;
      stepLobbyRider(
        rider,
        control,
        viewYaw,
        bikeOut && rider.place.kind !== "bike" ? othersAndBike : others
      );
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
    reset() {
      respawnRider(rider);
      bikeOut = false;
      fromX = rider.x;
      fromZ = rider.z;
      fromHeading = rider.heading;
    },
    rider,
    view,
    walkTo(x, z) {
      sendRiderTo(rider, x, z);
    },
  };
};
