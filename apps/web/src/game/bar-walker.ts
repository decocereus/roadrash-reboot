import { LOBBY_MAX_LEAN, LOBBY_TICK, SHOVE } from "@racer/sim/lobby";
import { lobbyPoses } from "@racer/sim/lobby-walk";
import type { LobbyPlaceKind, LobbyPose } from "@racer/sim/lobby-walk";
import { riderBlocks } from "@racer/sim/palette";
import type { RiderBlocks } from "@racer/sim/palette";
import * as THREE from "three";

import type { Assets } from "./assets.ts";
import { breathTurns, poseTurns } from "./bar-poses.ts";
import type { Tag, TagLayer } from "./bar-tags.ts";
import type { Shading } from "./cel.ts";
import { bodyFor } from "./figure-rig.ts";
import { blockPaletteOf } from "./rider-blocks.ts";
import { createRiderFigure } from "./rider-figure.ts";
import type { RiderFigure, Stance } from "./rider-figure.ts";

export const SOLO_SLOT = riderBlocks.length - 1;
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

export interface WalkerView {
  x: number;
  z: number;
  heading: number;
  lean: number;
  pace: number;
  stride: number;
  mounted: boolean;
}

export interface WalkerStance {
  readonly place: LobbyPlaceKind;
  readonly pose: LobbyPose | null;
  readonly shoving: number;
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

export interface BarWalker {
  readonly head: THREE.Vector3;
  readonly rename: (label: string) => void;
  readonly show: (visible: boolean) => void;
  readonly update: (
    stance: WalkerStance,
    view: WalkerView,
    bike: THREE.Object3D,
    time: number,
    seconds: number,
    camera: THREE.Camera,
    size: { readonly width: number; readonly height: number }
  ) => void;
  readonly dispose: () => void;
}

const createWalker = (
  assets: Assets,
  shading: Shading,
  tags: TagLayer,
  blocks: RiderBlocks,
  slot: number,
  parent: THREE.Object3D
): BarWalker => {
  const figure = createRiderFigure(
    bodyFor(assets, slot),
    shading,
    blockPaletteOf(blocks)
  );
  parent.add(figure.root);
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
  const tag: Tag = tags.name(blocks.name);
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
    { shoving: shoveLeft }: WalkerStance,
    view: WalkerView,
    bike: THREE.Object3D,
    seconds: number
  ): void => {
    figure.root.position.copy(bike.position);
    figure.root.quaternion.copy(bike.quaternion);
    figure.root.translateY(figure.seat.y);
    figure.root.translateZ(figure.seat.z);
    const age = SHOVE_SECONDS - shoveLeft * LOBBY_TICK;
    stance.pose = shoveLeft > 0 && age < PUNCH.back ? "punch" : "seated";
    stance.reach = stance.pose === "punch" ? punchReach(age) : 0;
    stance.lean = -view.lean / LOBBY_MAX_LEAN;
    stance.speed = BAR_RIDE_SPEED;
    figure.animate(stance, seconds);
    head.copy(figure.root.position);
    head.y += BIKE_TAG_LIFT;
  };

  const onFoot = (
    { pose, shoving: shoveLeft }: WalkerStance,
    view: WalkerView,
    time: number,
    seconds: number
  ): void => {
    figure.root.rotation.set(0, view.heading, 0);
    if (shoveLeft > 0) {
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
      hold(pose ? (poses.get(pose) ?? idle) : idle, time, seconds);
    }
    head.copy(figure.root.position);
    head.y += TAG_LIFT;
  };

  return {
    dispose() {
      figure.dispose();
    },
    head,
    rename: (label) => {
      tag.rename(label);
    },
    show(visible) {
      figure.root.visible = visible;
      tag.show(visible);
    },
    update(walking, view, bike, time, seconds, camera, size) {
      switch (walking.place) {
        case "bike": {
          onBike(walking, view, bike, seconds);
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
          onFoot(walking, view, time, seconds);
          break;
        }
        default: {
          walking.place satisfies never;
        }
      }
      tag.set(head, camera, size);
    },
  };
};

export interface BarWalkers {
  readonly at: (slot: number) => BarWalker;
  readonly hide: (slot: number) => void;
  readonly dispose: () => void;
}

export const createWalkers = (
  assets: Assets,
  shading: Shading,
  tags: TagLayer,
  parent: THREE.Object3D
): BarWalkers => {
  const made = new Map<number, BarWalker>();
  return {
    at(slot) {
      const known = made.get(slot);
      if (known) {
        return known;
      }
      const blocks = riderBlocks[slot];
      if (!blocks) {
        throw new Error(
          `The bar has no colour blocks for slot ${String(slot)}.`
        );
      }
      const walker = createWalker(assets, shading, tags, blocks, slot, parent);
      made.set(slot, walker);
      return walker;
    },
    dispose() {
      for (const walker of made.values()) {
        walker.dispose();
      }
    },
    hide(slot) {
      made.get(slot)?.show(false);
    },
  };
};
