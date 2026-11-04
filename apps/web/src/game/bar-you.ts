import {
  lobbyPoses,
  LOBBY_MAX_LEAN,
  LOBBY_TICK,
  SHOVE,
} from "@racer/sim/lobby";
import type { LobbyPose, LobbyRider } from "@racer/sim/lobby";
import * as THREE from "three";

import type { Assets } from "./assets.ts";
import { blockPaletteOf, riderBlocks } from "./bar-blocks.ts";
import { breathTurns, poseTurns } from "./bar-poses.ts";
import type { Tag, TagLayer } from "./bar-tags.ts";
import type { Shading } from "./cel.ts";
import { bodyFor } from "./figure-rig.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, Stance } from "./rider-figure.ts";

const YOUR_BLOCKS = riderBlocks.length - 1;
const STOOL_SEAT = 1;
const TAG_LIFT = 1;
const SEATED_TAG_LIFT = 1.02;
const BIKE_TAG_LIFT = 0.9;
const RUN_HZ = 2.6;
const MOVING_PACE = 0.45;
const BOB = 0.05;
const BAR_RIDE_SPEED = 14;
const FULL_TURN = Math.PI * 2;
const BREATH_RATE = 0.7;
const PUNCH = { back: 0.22, hold: 0.13, out: 0.07 } as const;
const SHOVE_SECONDS = SHOVE.ticks * LOBBY_TICK;

export const yourBlocks = riderBlocks[YOUR_BLOCKS];

export interface YouView {
  x: number;
  z: number;
  heading: number;
  lean: number;
  pace: number;
  stride: number;
  mounted: boolean;
}

interface Held {
  readonly still: number[];
  readonly breath: number[];
}

const punchReach = (age: number): number => {
  if (age < PUNCH.out) {
    return age / PUNCH.out;
  }
  if (age < PUNCH.hold) {
    return 1;
  }
  return Math.max(0, 1 - (age - PUNCH.hold) / (PUNCH.back - PUNCH.hold));
};

export interface BarYou {
  readonly figure: RiderFigure;
  readonly head: THREE.Vector3;
  readonly update: (
    rider: LobbyRider,
    view: YouView,
    bike: THREE.Object3D,
    time: number,
    seconds: number,
    camera: THREE.Camera,
    size: { readonly width: number; readonly height: number }
  ) => void;
  readonly dispose: () => void;
}

export const createYou = (
  assets: Assets,
  shading: Shading,
  tags: TagLayer
): BarYou => {
  if (!yourBlocks) {
    throw new Error("The bar has no rider blocks for you.");
  }
  const figure = createRiderFigure(
    bodyFor(assets, YOUR_BLOCKS),
    shading,
    blockPaletteOf(yourBlocks)
  );
  const heldFor = (
    base: "stand" | "seated",
    turns: Parameters<RiderFigure["bakePose"]>[1]
  ): Held => ({
    breath: figure.bakePose(base, [...turns, ...breathTurns]),
    still: figure.bakePose(base, turns),
  });
  const idle = heldFor("stand", poseTurns.relaxed);
  const seated = heldFor("seated", []);
  const shoving = figure.bakePose("stand", poseTurns.shove);
  const poses = new Map<LobbyPose, Held>(
    lobbyPoses.map((pose) => [pose, heldFor("stand", poseTurns[pose])])
  );
  const tag: Tag = tags.name("YOU");
  tag.show(true);
  const head = new THREE.Vector3();
  const stance: Stance = {
    flinch: 0,
    flinchSide: 1,
    lean: 0,
    pose: "seated",
    reach: 0,
    rise: 0,
    side: 1,
    speed: BAR_RIDE_SPEED,
    time: 0,
    tuck: 0,
    weapon: "none",
  };

  const hold = (held: Held, time: number, seconds: number): void => {
    const blend = 0.5 + 0.5 * Math.sin(time * BREATH_RATE);
    figure.holdPose(held.still, held.breath, blend, seconds);
  };

  const onBike = (
    rider: LobbyRider,
    view: YouView,
    bike: THREE.Object3D,
    seconds: number
  ): void => {
    figure.root.position.copy(bike.position);
    figure.root.quaternion.copy(bike.quaternion);
    figure.root.translateY(figure.seat.y);
    figure.root.translateZ(figure.seat.z);
    const age = SHOVE_SECONDS - rider.shoving * LOBBY_TICK;
    stance.pose = rider.shoving > 0 && age < PUNCH.back ? "punch" : "seated";
    stance.reach = stance.pose === "punch" ? punchReach(age) : 0;
    stance.lean = -view.lean / LOBBY_MAX_LEAN;
    stance.speed = BAR_RIDE_SPEED;
    figure.animate(stance, seconds);
    head.copy(figure.root.position);
    head.y += BIKE_TAG_LIFT;
  };

  const onFoot = (
    rider: LobbyRider,
    view: YouView,
    time: number,
    seconds: number
  ): void => {
    figure.root.rotation.set(0, view.heading, 0);
    if (rider.shoving > 0) {
      figure.root.position.set(view.x, figure.standHeight, view.z);
      figure.holdPose(shoving, shoving, 0, seconds);
    } else if (view.pace > MOVING_PACE) {
      stance.pose = "run";
      stance.reach = 0;
      stance.lean = 0;
      stance.speed = 0;
      stance.time = view.stride;
      const bob = Math.abs(Math.sin(view.stride * FULL_TURN * RUN_HZ)) * BOB;
      figure.root.position.set(view.x, figure.standHeight + bob, view.z);
      figure.animate(stance, seconds);
    } else {
      figure.root.position.set(view.x, figure.standHeight, view.z);
      const pose = rider.place.kind === "foot" ? rider.place.pose : null;
      hold(pose ? (poses.get(pose) ?? idle) : idle, time, seconds);
    }
    head.copy(figure.root.position);
    head.y += TAG_LIFT;
  };

  return {
    dispose() {
      figure.dispose();
    },
    figure,
    head,
    update(rider, view, bike, time, seconds, camera, size) {
      switch (rider.place.kind) {
        case "bike": {
          onBike(rider, view, bike, seconds);
          break;
        }
        case "stool": {
          figure.root.rotation.set(0, view.heading, 0);
          figure.root.position.set(view.x, STOOL_SEAT, view.z);
          hold(seated, time, seconds);
          head.copy(figure.root.position);
          head.y += SEATED_TAG_LIFT;
          break;
        }
        case "foot": {
          onFoot(rider, view, time, seconds);
          break;
        }
        default: {
          rider.place satisfies never;
        }
      }
      tag.set(head, camera, size);
    },
  };
};
