import type { RoomLobbyMessage, RoomWalked } from "@racer/rooms/messages";
import { launchRoomConfig, publicRuleFor } from "@racer/rooms/room-config";
import { createLobbyRider } from "@racer/sim/lobby";
import { riderBlocks } from "@racer/sim/palette";
import { trackFor } from "@racer/track/roads";
import { placeOnTrack } from "@racer/track/track";
import type { TrackPoint } from "@racer/track/track";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { poseOnTrack } from "../src/game/actors.ts";
import { assetParsers } from "../src/game/assets.ts";
import type { RiderAsset } from "../src/game/assets.ts";
import { createMembers } from "../src/game/bar-members.ts";
import type { BarSpeech } from "../src/game/bar-speech.ts";
import type { Tag, TagLayer } from "../src/game/bar-tags.ts";
import { createWalkers } from "../src/game/bar-walker.ts";
import { createShading } from "../src/game/cel.ts";
import { paletteOf } from "../src/game/figure-rig.ts";
import { gaitOf } from "../src/game/gait.ts";
import { lookOf } from "../src/game/looks.ts";
import { createRiderFigure } from "../src/game/rider-figure.ts";
import type { RiderFigure } from "../src/game/rider-figure.ts";
import type { RiderMoves } from "../src/game/rider-moves.ts";
import { createStrider } from "../src/game/strider.ts";
import type { Strider } from "../src/game/strider.ts";
import { artFile } from "./art-files.ts";
import { pinnedAssets } from "./pinned-assets.ts";

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
const STOP_PACE = 5.5;
const CORRECTION = 0.29;
const SETTLE_FRAMES = 120;
const IDLE_FRAMES = 240;
const RIDGE_ROAD_FROM = 2235;
const RIDGE_ROAD_PACE = 7;
const ROAD_FRAMES = 360;
const ROAD_SEARCH = 1.5;
const ROAD_STEP = 0.01;

const shading = createShading(lookOf("salt-coast"));

const movesOf = async (): Promise<RiderMoves> => {
  const { value } = await assetParsers.moves(
    artFile(modelUrls.moves),
    modelUrls.moves
  );
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

interface Idle {
  readonly figure: RiderFigure;
  readonly strider: Strider;
}

const standing = (rider: RiderAsset, moves: RiderMoves): Idle => {
  const figure = createRiderFigure(rider, shading, paletteOf(0));
  const strider = createStrider(gaitOf(rider, moves), rider.bones.length);
  figure.root.position.set(0, figure.standHeight, 0);
  return { figure, strider };
};

const stepOn = ({ figure, strider }: Idle, pace: number): void => {
  strider.step(pace, FRAME);
  figure.onFoot(strider, "none", FRAME);
  figure.root.updateMatrixWorld(true);
};

const highestBall = (root: THREE.Object3D): number =>
  Math.max(
    ...SIDES.map(({ ball }) => {
      const bone = root.getObjectByName(ball);
      if (!bone) {
        throw new Error(`The figure has no ${ball}.`);
      }
      return bone.getWorldPosition(new THREE.Vector3()).y;
    })
  );

const silentTag: Tag = {
  rename: vi.fn<() => void>(),
  set: vi.fn<() => void>(),
  show: vi.fn<() => void>(),
};

const silentTags: TagLayer = {
  bubble: () => silentTag,
  dispose: vi.fn<() => void>(),
  name: () => silentTag,
  prompt: () => silentTag,
  reveal: vi.fn<() => void>(),
};

const twoInTheRoom: RoomLobbyMessage = {
  atMs: 0,
  edition: 0,
  hostId: null,
  kind: "lobby",
  lostRace: null,
  members: ["near", "far"].map((id, colour) => ({
    colour,
    here: true,
    id,
    name: id,
    ready: false,
    rttMs: null,
  })),
  phase: "gathering",
  roomKind: "custom",
  rule: publicRuleFor(launchRoomConfig.publicRace, 0),
  seatHoldSeconds: 30,
  startsInMs: null,
  you: "near",
};

const roadUnder = (
  track: ReturnType<typeof trackFor>,
  along: number,
  ball: THREE.Vector3
): number => {
  const point: TrackPoint = { heading: 0, slope: 0, x: 0, y: 0, z: 0 };
  let nearest = Number.POSITIVE_INFINITY;
  let height = Number.NaN;
  for (let s = along - ROAD_SEARCH; s <= along + ROAD_SEARCH; s += ROAD_STEP) {
    placeOnTrack(track, s, 0, point);
    const away = Math.hypot(point.x - ball.x, point.z - ball.z);
    if (away < nearest) {
      nearest = away;
      height = point.y;
    }
  }
  return height;
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

  it("puts both feet down when a run stops dead", async () => {
    const moves = await movesOf();
    for (const rider of await ridersOf()) {
      const idle = standing(rider, moves);
      const forward = forwardOf(idle.figure, idle.strider);
      for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
        idle.figure.root.position.addScaledVector(forward, STOP_PACE * FRAME);
        stepOn(idle, STOP_PACE);
      }
      let highest = 0;
      for (let frame = 0; frame < IDLE_FRAMES; frame += 1) {
        stepOn(idle, 0);
        if (frame >= SETTLE_FRAMES) {
          highest = Math.max(highest, highestBall(idle.figure.root));
        }
      }
      idle.figure.dispose();
      expect(highest).toBeLessThan(FLOAT);
    }
  });

  it("re-plants a standing rider's feet after the body is moved 29 cm", async () => {
    const moves = await movesOf();
    for (const rider of await ridersOf()) {
      const idle = standing(rider, moves);
      for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
        stepOn(idle, 0);
      }
      idle.figure.root.position.x += CORRECTION;
      let highest = 0;
      for (let frame = 0; frame < IDLE_FRAMES; frame += 1) {
        stepOn(idle, 0);
        if (frame >= SETTLE_FRAMES) {
          highest = Math.max(highest, highestBall(idle.figure.root));
        }
      }
      idle.figure.dispose();
      expect(highest).toBeLessThan(FLOAT);
    }
  });

  it("re-plants a room member's feet after a 29 cm correction while they stand", async () => {
    const assets = await pinnedAssets();
    const parent = new THREE.Group();
    const walkers = createWalkers(assets, shading, silentTags, parent);
    let heard: RoomWalked = {
      heading: 0,
      kind: "walk",
      lean: 0,
      member: "far",
      pace: 0,
      place: "foot",
      pose: null,
      x: 0,
      z: 2,
    };
    const corrected: RoomWalked = { ...heard, x: CORRECTION };
    const members = createMembers({
      bikes: {
        fits: riderBlocks.map(() => assets.bikes.seraph.fit),
        roots: riderBlocks.map(() => new THREE.Object3D()),
        show: vi.fn<(index: number) => void>(),
        spin: vi.fn<(index: number, distance: number) => void>(),
      },
      firstBike: 0,
      rider: createLobbyRider(),
      seat: {
        act: vi.fn<() => void>(),
        listen: vi.fn<() => void>(),
        lobby: () => twoInTheRoom,
        phase: () => "lobby",
        walk: vi.fn<() => void>(),
        walkOf: (id) => (id === heard.member ? heard : undefined),
      },
      speech: { say: vi.fn<BarSpeech["say"]>() },
      walkers,
    });
    const camera = new THREE.Camera();
    const size = { height: 1, width: 1 };
    let highest = 0;
    for (let frame = 0; frame < SETTLE_FRAMES + IDLE_FRAMES; frame += 1) {
      if (frame === SETTLE_FRAMES) {
        heard = corrected;
      }
      members.step(FRAME, frame * FRAME);
      members.draw(FRAME, camera, size);
      if (frame >= 2 * SETTLE_FRAMES) {
        const root = parent.children.at(-1);
        if (!root) {
          throw new Error("The room drew nobody.");
        }
        root.updateMatrixWorld(true);
        highest = Math.max(highest, highestBall(root));
      }
    }
    walkers.dispose();
    expect(parent.children).toHaveLength(1);
    expect(highest).toBeLessThan(FLOAT);
  });

  it("keeps a running foot on a sloping road, not on a level floor through the hips", async () => {
    const moves = await movesOf();
    const [rider] = await ridersOf();
    if (!rider) {
      throw new Error("No rider model is loaded.");
    }
    const track = trackFor("ridge-road");
    const idle = standing(rider, moves);
    let deepest = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < ROAD_FRAMES; frame += 1) {
      const along = RIDGE_ROAD_FROM + frame * RIDGE_ROAD_PACE * FRAME;
      poseOnTrack(
        idle.figure.root,
        track,
        along,
        0,
        idle.figure.standHeight,
        0,
        0,
        0
      );
      stepOn(idle, RIDGE_ROAD_PACE);
      if (frame >= WARM_FRAMES) {
        for (const { ball } of SIDES) {
          const at = placeOf(idle.figure, ball);
          deepest = Math.min(deepest, at.y - roadUnder(track, along, at));
        }
      }
    }
    idle.figure.dispose();
    expect(deepest).toBeGreaterThan(-SINK);
  });

  it("refuses a moves file without one of its loops", async () => {
    const bytes = renamed(artFile(modelUrls.moves), "jog", "goj");
    await expect(assetParsers.moves(bytes, modelUrls.moves)).rejects.toThrow(
      "have no jog loop"
    );
  });
});
