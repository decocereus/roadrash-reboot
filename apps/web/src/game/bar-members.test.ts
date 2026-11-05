import { publicRoomRule } from "@racer/career/room-race";
import type { RoomLobbyMessage, RoomWalked } from "@racer/rooms/messages";
import type { RoomSeat, SeatPhase } from "@racer/rooms/seat-client";
import { createLobbyRider } from "@racer/sim/lobby";
import { riderBlocks } from "@racer/sim/palette";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createMembers } from "./bar-members.ts";
import type { BarWalker } from "./bar-walker.ts";

const FRAME = 1 / 8;
const BLINK = 1 / 6000;

const standing: RoomWalked = {
  heading: 0,
  kind: "walk",
  lean: 0,
  member: "far",
  pace: 0,
  place: "foot",
  pose: null,
  x: 1,
  z: 2,
};

const lobbyOf = (ids: readonly string[]): RoomLobbyMessage => ({
  atMs: 0,
  edition: 0,
  hostId: null,
  kind: "lobby",
  members: ids.map((id, colour) => ({
    colour,
    here: true,
    id,
    name: id,
    ready: false,
  })),
  phase: "gathering",
  roomKind: "custom",
  rule: publicRoomRule,
  startsInMs: null,
  you: "near",
});

interface Heard {
  readonly lobby: () => RoomLobbyMessage | null;
  readonly phase?: () => SeatPhase;
  readonly walkOf?: () => RoomWalked | null;
}

const room = ({ lobby, phase, walkOf }: Heard) => {
  const rename = vi.fn<BarWalker["rename"]>();
  const update = vi.fn<BarWalker["update"]>();
  const listen = vi.fn<RoomSeat["listen"]>();
  const walker: BarWalker = {
    dispose: vi.fn<BarWalker["dispose"]>(),
    head: new THREE.Vector3(),
    rename,
    show: vi.fn<BarWalker["show"]>(),
    update,
  };
  const walk = vi.fn<() => void>();
  const members = createMembers({
    bikes: {
      roots: riderBlocks.map(() => new THREE.Object3D()),
      show: vi.fn<(index: number) => void>(),
      spin: vi.fn<(index: number, distance: number) => void>(),
    },
    firstBike: 0,
    rider: createLobbyRider(),
    seat: {
      act: vi.fn<() => void>(),
      listen,
      lobby,
      phase: phase ?? (() => "lobby"),
      walk,
      walkOf: () => walkOf?.() ?? undefined,
    },
    speech: { say: vi.fn<() => void>() },
    walkers: { at: () => walker, hide: vi.fn<() => void>() },
  });
  return { listen, members, rename, update, walk };
};

describe("members in the bar", () => {
  it("sends the first walk once the room has listed this rider", () => {
    let lobby: RoomLobbyMessage | null = null;
    const { members, walk } = room({ lobby: () => lobby });
    members.step(FRAME, 0);
    expect(walk).not.toHaveBeenCalled();
    lobby = lobbyOf(["near"]);
    members.step(FRAME, 0);
    expect(walk).toHaveBeenCalledOnce();
  });

  it("stands a member who has not moved where the seat last heard them", () => {
    const { members, rename } = room({
      lobby: () => lobbyOf(["near", "far"]),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    expect(rename).toHaveBeenCalledWith("far");
    expect(members.spotOf(1)).toMatchObject({ x: standing.x, z: standing.z });
  });

  it("does not hand a shove to the next member in the same colour", () => {
    let ids = ["near", "far"];
    const { listen, members, update } = room({
      lobby: () => lobbyOf(ids),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    listen.mock.calls[0]?.[0].onActed?.({
      act: "shove",
      from: "far",
      kind: "act",
      target: "near",
    });
    ids = ["near"];
    members.step(BLINK, 0);
    ids = ["near", "next"];
    members.step(BLINK, 0);
    members.draw(BLINK, new THREE.Camera(), { height: 1, width: 1 });
    expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ shoving: 0 });
  });

  it("walks the others to the door and stops sending once the race begins", () => {
    let phase: SeatPhase = "lobby";
    const { members, walk } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    expect(walk).toHaveBeenCalledOnce();
    const before = members.spotOf(1)?.z ?? 0;
    phase = "loading";
    for (let frame = 0; frame < 16; frame += 1) {
      members.step(FRAME, frame);
    }
    expect(walk).toHaveBeenCalledOnce();
    expect(members.spotOf(1)?.z).toBeLessThan(before);
  });
});
