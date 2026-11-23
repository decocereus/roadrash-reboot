import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { RiderAsset } from "../src/game/assets.ts";
import { createShading } from "../src/game/cel.ts";
import { paletteOf } from "../src/game/figure-rig.ts";
import { gaitOf } from "../src/game/gait.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { RiderFigure } from "../src/game/rider-figure.ts";
import { parseMoves } from "../src/game/rider-moves.ts";
import type { RiderMoves } from "../src/game/rider-moves.ts";
import { createStrider } from "../src/game/strider.ts";
import type { Strider } from "../src/game/strider.ts";
import { artFile } from "./art-files.ts";

const FRAME = 1 / 60;
const WARM_FRAMES = 60;
const MEASURED_FRAMES = 240;
const CONTACT = 0.015;
const SLIP_SHARE = 0.02;
const SINK = 0.002;
const FLOAT = 0.02;
const FIRST_FRAME_REACH = 0.03;
const STRIKE_REACH = 0.03;
const SWING_LIFT = 0.08;
const LANDING_FRAMES = 6;
const DESCENT = 0.01;
const SIDES = [
  { ankle: "foot_l", ball: "ball_l", strike: 0 },
  { ankle: "foot_r", ball: "ball_r", strike: 0.5 },
] as const;
const PACES = [1.6, 4.4, 7] as const;

const shading = createShading(lookOf("salt-coast"));

const movesOf = async (): Promise<RiderMoves> => {
  const { value } = await parseMoves(artFile(modelUrls.moves), modelUrls.moves);
  return value;
};

const ridersOf = async (): Promise<RiderAsset[]> =>
  await Promise.all(
    modelUrls.figures.map(async (url) => {
      const { value } = await assetParsers.rider(artFile(url), url);
      return value;
    })
  );

const boneOf = (figure: RiderFigure, name: string): THREE.Object3D => {
  const bone = figure.root.getObjectByName(name);
  if (!bone) {
    throw new Error(`The figure has no ${name}.`);
  }
  return bone;
};

const placeOf = (figure: RiderFigure, name: string): THREE.Vector3 =>
  boneOf(figure, name).getWorldPosition(new THREE.Vector3());

const forwardOf = (figure: RiderFigure, strider: Strider): THREE.Vector3 => {
  strider.step(0, FRAME);
  figure.onFoot(strider, "none", FRAME);
  figure.root.updateMatrixWorld(true);
  return placeOf(figure, "ball_l")
    .sub(placeOf(figure, "foot_l"))
    .setY(0)
    .normalize();
};

const crossed = (before: number, after: number, mark: number): boolean =>
  after >= before
    ? before < mark && mark <= after
    : before < mark || mark <= after;

interface Foot {
  lowestAnkle: number;
  highestAnkle: number;
  readonly strikes: number[];
  readonly heels: number[];
  readonly balls: THREE.Vector3[];
}

interface Planted {
  readonly slip: number;
  readonly lowest: number;
}

const plantedOf = ({ balls }: Foot, pace: number): Planted => {
  const lowest = Math.min(...balls.map(({ y }) => y));
  let slid = 0;
  let travelled = 0;
  for (const [index, now] of balls.entries()) {
    const then = balls[index - 1];
    if (then && now.y < lowest + CONTACT && then.y < lowest + CONTACT) {
      slid += Math.hypot(now.x - then.x, now.z - then.z);
      travelled += pace * FRAME;
    }
  }
  expect(travelled).toBeGreaterThan(0);
  return { lowest, slip: slid / travelled };
};

const walk = (
  rider: RiderAsset,
  moves: RiderMoves,
  pace: number
): readonly Foot[] => {
  const figure = createRiderFigure(rider, shading, paletteOf(0));
  const strider = createStrider(gaitOf(rider, moves), rider.bones.length);
  figure.root.position.set(0, figure.standHeight, 0);
  const forward = forwardOf(figure, strider);
  const feet = SIDES.map((): Foot => ({
    balls: [],
    heels: [],
    highestAnkle: Number.NEGATIVE_INFINITY,
    lowestAnkle: Number.POSITIVE_INFINITY,
    strikes: [],
  }));
  let phase = strider.phase();
  for (let frame = 0; frame < WARM_FRAMES + MEASURED_FRAMES; frame += 1) {
    figure.root.position.addScaledVector(forward, pace * FRAME);
    strider.step(pace, FRAME);
    figure.onFoot(strider, "none", FRAME);
    figure.root.updateMatrixWorld(true);
    const next = strider.phase();
    for (const [side, { ankle, ball, strike }] of SIDES.entries()) {
      const foot = feet[side];
      if (!foot) {
        throw new Error("Each side has a foot.");
      }
      const heel = placeOf(figure, ankle).y;
      foot.heels.push(heel);
      if (frame > WARM_FRAMES) {
        foot.balls.push(placeOf(figure, ball));
        foot.lowestAnkle = Math.min(foot.lowestAnkle, heel);
        foot.highestAnkle = Math.max(foot.highestAnkle, heel);
        if (crossed(phase, next, strike)) {
          foot.strikes.push(frame);
        }
      }
    }
    phase = next;
  }
  figure.dispose();
  return feet;
};

const renamed = (bytes: ArrayBuffer, from: string, to: string): ArrayBuffer => {
  const jsonLength = new DataView(bytes).getUint32(12, true);
  const json = new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength));
  const copy = structuredClone(bytes);
  new Uint8Array(copy, 20, jsonLength).set(
    new TextEncoder().encode(json.replace(`"name":"${from}"`, `"name":"${to}"`))
  );
  return copy;
};

describe("riders on foot", () => {
  it.each(PACES)(
    "keep each planted foot still and on the floor at %s m/s",
    async (pace) => {
      const moves = await movesOf();
      for (const rider of await ridersOf()) {
        for (const foot of walk(rider, moves, pace)) {
          const { lowest, slip } = plantedOf(foot, pace);
          expect(slip).toBeLessThan(SLIP_SHARE);
          expect(lowest).toBeGreaterThan(-SINK);
          expect(lowest).toBeLessThan(FLOAT);
        }
      }
    }
  );

  it.each(PACES)(
    "strikes the left heel at phase 0 and the right at phase 0.5 at %s m/s",
    async (pace) => {
      const moves = await movesOf();
      for (const rider of await ridersOf()) {
        for (const foot of walk(rider, moves, pace)) {
          expect(foot.highestAnkle - foot.lowestAnkle).toBeGreaterThan(
            SWING_LIFT
          );
          expect(foot.strikes.length).toBeGreaterThan(0);
          for (const frame of foot.strikes) {
            const heel = foot.heels[frame] ?? Number.NaN;
            const falling = foot.heels[frame - LANDING_FRAMES] ?? Number.NaN;
            expect(heel - foot.lowestAnkle).toBeLessThan(STRIKE_REACH);
            expect(falling - heel).toBeGreaterThan(DESCENT);
          }
        }
      }
    }
  );

  it("stands on its feet from the first frame instead of fading in from the saddle", async () => {
    const moves = await movesOf();
    for (const rider of await ridersOf()) {
      const figure = createRiderFigure(rider, shading, paletteOf(0));
      const strider = createStrider(gaitOf(rider, moves), rider.bones.length);
      figure.root.position.set(0, figure.standHeight, 0);
      strider.step(0, FRAME);
      figure.onFoot(strider, "none", FRAME);
      figure.root.updateMatrixWorld(true);
      for (const { ball } of SIDES) {
        expect(placeOf(figure, ball).y).toBeLessThan(FIRST_FRAME_REACH);
      }
      figure.dispose();
    }
  });

  it("refuses a moves file without one of its loops", async () => {
    const bytes = renamed(artFile(modelUrls.moves), "jog", "goj");
    await expect(parseMoves(bytes, modelUrls.moves)).rejects.toThrow(
      "have no jog loop"
    );
  });
});
