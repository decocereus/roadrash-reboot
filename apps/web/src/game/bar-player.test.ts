import { createLobbyRider, sendRiderTo } from "@racer/sim/lobby";
import type { LobbyRider } from "@racer/sim/lobby";
import { GARAGE_PLINTH } from "@racer/sim/lobby-floor";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createBarPlayer } from "./bar-player.ts";
import type { BarPlayer, PlayerSlot } from "./bar-player.ts";
import type { BarWalker } from "./bar-walker.ts";

const FRAME = 1 / 60;
const noControl = { forward: 0, right: 0, sprint: false };

const walker = (): BarWalker => ({
  dispose: vi.fn<BarWalker["dispose"]>(),
  head: new THREE.Vector3(),
  rename: vi.fn<BarWalker["rename"]>(),
  show: vi.fn<BarWalker["show"]>(),
  update: vi.fn<BarWalker["update"]>(),
});

const slotWith = (bikeIndex: number): PlayerSlot => ({
  bike: new THREE.Object3D(),
  bikeIndex,
  walker: walker(),
});

const playerOf = (
  rider: LobbyRider,
  slot: () => PlayerSlot,
  walkUp: (spot: "garage") => void = vi.fn<(spot: "garage") => void>()
): BarPlayer =>
  createBarPlayer({
    bikes: {
      sag: vi.fn<(index: number, metres: number) => void>(),
      show: vi.fn<(index: number) => void>(),
      spin: vi.fn<(index: number, distance: number) => void>(),
    },
    company: {
      crowd: () => [],
      greet: vi.fn<() => void>(),
      nearest: () => null,
      shove: vi.fn<() => void>(),
      spotOf: () => null,
    },
    puffs: { burst: vi.fn<() => void>() },
    rider,
    slot,
    speech: { say: vi.fn<() => void>() },
    walkUp,
  });

const walkFor = (player: BarPlayer, seconds: number): void => {
  for (let time = 0; time < seconds; time += FRAME) {
    player.advance(FRAME, noControl, 0, time);
  }
};

describe("the garage stand", () => {
  it("opens the Garage when the rider walks up and presses E", () => {
    const rider = createLobbyRider();
    const walkUp = vi.fn<(spot: "garage") => void>();
    const player = playerOf(rider, () => slotWith(2), walkUp);
    sendRiderTo(
      rider,
      GARAGE_PLINTH.x - GARAGE_PLINTH.radius - 0.6,
      GARAGE_PLINTH.z
    );
    walkFor(player, 8);
    player.act("interact", 8);
    expect(walkUp.mock.calls).toStrictEqual([["garage"]]);
  });

  it("leaves E to greeting and sitting away from the stand", () => {
    const rider = createLobbyRider();
    const walkUp = vi.fn<(spot: "garage") => void>();
    const player = playerOf(rider, () => slotWith(2), walkUp);
    player.act("interact", 0);
    expect(walkUp).not.toHaveBeenCalled();
  });
});

describe("a parked bike when the member list shifts", () => {
  it("stays where the rider left it when they take another slot", () => {
    const first = slotWith(3);
    const second = slotWith(2);
    let current = first;
    const rider = createLobbyRider();
    rider.bikeFound = true;
    const player = playerOf(rider, () => current);
    player.act("bike", 0);
    player.advance(FRAME, noControl, 0, 0);
    player.act("bike", 0);
    const { x, z } = first.bike.position;
    const { y } = first.bike.rotation;
    expect(first.bike.position.lengthSq()).toBeGreaterThan(0);
    first.bike.position.set(8, 0, 8);
    second.bike.position.set(1, 0, 1);
    current = second;
    player.advance(FRAME, noControl, 0, 0);
    expect(second.bike.position.x).toBe(x);
    expect(second.bike.position.z).toBe(z);
    expect(second.bike.rotation.y).toBe(y);
  });
});
