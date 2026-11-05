import { publicRoomRule } from "@racer/career/room-race";
import type { RoomLobbyMessage, RoomWalked } from "@racer/rooms/messages";
import type { RoomSeat, SeatPhase } from "@racer/rooms/seat-client";
import { createLobbyRider, SHOVE } from "@racer/sim/lobby";
import { doorSpot } from "@racer/sim/lobby-floor";
import { riderBlocks } from "@racer/sim/palette";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createMembers } from "./bar-members.ts";
import type { BarSpeech } from "./bar-speech.ts";
import type { BarWalker } from "./bar-walker.ts";

const FRAME = 1 / 8;
const BLINK = 1 / 6000;
const TICK = 1 / 60;

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

const heardAt = (member: string, x: number, z: number): RoomWalked => ({
  ...standing,
  member,
  x,
  z,
});

const lobbyOf = (
  ids: readonly string[],
  away: readonly string[] = []
): RoomLobbyMessage => ({
  atMs: 0,
  edition: 0,
  hostId: null,
  kind: "lobby",
  members: ids.map((id, colour) => ({
    colour,
    here: !away.includes(id),
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
  readonly walkOf?: (id: string) => RoomWalked | null;
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
  const act = vi.fn<RoomSeat["act"]>();
  const say = vi.fn<BarSpeech["say"]>();
  const hide = vi.fn<(index: number) => void>();
  const showBike = vi.fn<(index: number) => void>();
  const rider = createLobbyRider();
  const members = createMembers({
    bikes: {
      roots: riderBlocks.map(() => new THREE.Object3D()),
      show: showBike,
      spin: vi.fn<(index: number, distance: number) => void>(),
    },
    firstBike: 0,
    rider,
    seat: {
      act,
      listen,
      lobby,
      phase: phase ?? (() => "lobby"),
      walk,
      walkOf: (id) => walkOf?.(id) ?? undefined,
    },
    speech: { say },
    walkers: { at: () => walker, hide },
  });
  const heardShove = (from: string, target: string): void => {
    listen.mock.calls[0]?.[0].onActed?.({
      act: "shove",
      from,
      kind: "act",
      target,
    });
  };
  const stance = (): Parameters<BarWalker["update"]>[0] | undefined => {
    members.draw(BLINK, new THREE.Camera(), { height: 1, width: 1 });
    return update.mock.calls.at(-1)?.[0];
  };
  return {
    act,
    heardShove,
    hide,
    listen,
    members,
    rename,
    rider,
    say,
    showBike,
    stance,
    update,
    walk,
  };
};

const movedFrom = (
  spot: { readonly x: number; readonly z: number } | null | undefined,
  from: { readonly x: number; readonly z: number }
): number =>
  Math.hypot((spot?.x ?? from.x) - from.x, (spot?.z ?? from.z) - from.z);

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

  it("takes a member out of the room when their colour empties", () => {
    let ids = ["near", "far"];
    const { hide, members } = room({
      lobby: () => lobbyOf(ids),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    expect(members.crowd()).toHaveLength(1);
    expect(hide).not.toHaveBeenCalledWith(1);
    ids = ["near"];
    members.step(FRAME, 0);
    expect(hide).toHaveBeenCalledWith(1);
    expect(members.crowd()).toStrictEqual([]);
  });

  it("finds the nearest member only while they are in the room", () => {
    let ids = ["near", "far"];
    const { members } = room({
      lobby: () => lobbyOf(ids),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    expect(members.nearest(standing.x, standing.z, 1)).toBe(1);
    ids = ["near"];
    members.step(FRAME, 0);
    expect(members.nearest(standing.x, standing.z, 1)).toBeNull();
  });

  it("draws nobody for a member the seat has not heard or who is away", () => {
    let lobby = lobbyOf(["near", "far"]);
    let heard: RoomWalked | null = null;
    const { hide, members, update } = room({
      lobby: () => lobby,
      walkOf: () => heard,
    });
    members.step(FRAME, 0);
    members.draw(FRAME, new THREE.Camera(), { height: 1, width: 1 });
    expect(hide).toHaveBeenCalledWith(1);
    expect(update).not.toHaveBeenCalled();
    lobby = lobbyOf(["near", "far"], ["far"]);
    heard = standing;
    members.step(FRAME, 0);
    members.draw(FRAME, new THREE.Camera(), { height: 1, width: 1 });
    expect(update).not.toHaveBeenCalled();
    expect(members.crowd()).toStrictEqual([]);
  });

  it("leaves this rider's own colour to the player", () => {
    const { hide, members, rename, update } = room({
      lobby: () => lobbyOf(["near", "far"]),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    members.draw(FRAME, new THREE.Camera(), { height: 1, width: 1 });
    expect(members.mine()).toBe(0);
    expect(update).toHaveBeenCalledOnce();
    expect(rename).not.toHaveBeenCalledWith("near");
    expect(hide).not.toHaveBeenCalledWith(0);
  });

  it("draws a member in the place and pose the seat heard", () => {
    const { members, stance } = room({
      lobby: () => lobbyOf(["near", "far"]),
      walkOf: () => ({ ...standing, place: "stool", pose: "chat" }),
    });
    members.step(FRAME, 0);
    expect(stance()).toStrictEqual({
      place: "stool",
      pose: "chat",
      shoving: 0,
    });
  });

  it("greets and shoves only a member who is in the room", () => {
    let ids = ["near", "far"];
    const { act, members, say } = room({
      lobby: () => lobbyOf(ids),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    members.greet(1, 0, 0, 0);
    members.shove(1, 0, 0, 0);
    expect(act.mock.calls).toStrictEqual([
      ["greet", "far"],
      ["shove", "far"],
    ]);
    ids = ["near"];
    members.step(FRAME, 0);
    members.greet(1, 0, 0, 0);
    members.shove(1, 0, 0, 0);
    expect(act).toHaveBeenCalledTimes(2);
    expect(say.mock.calls.map(([text]) => text)).toStrictEqual(["SUP", "OI!"]);
  });

  it("plays a heard shove on the member who threw it until it runs out", () => {
    const { heardShove, members, stance } = room({
      lobby: () => lobbyOf(["near", "far"]),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    expect(stance()?.shoving).toBe(0);
    heardShove("far", "near");
    expect(stance()?.shoving).toBe(SHOVE.ticks);
    members.step(TICK, 0);
    expect(stance()?.shoving).toBeCloseTo(SHOVE.ticks - 1);
    members.step(1, 0);
    expect(stance()?.shoving).toBe(0);
  });

  it("pushes this rider away from where the shover stands", () => {
    const { heardShove, members, rider } = room({
      lobby: () => lobbyOf(["near", "far", "other"]),
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    heardShove("far", "other");
    expect(rider.pushX).toBe(0);
    expect(rider.pushZ).toBe(0);
    heardShove("far", "near");
    const away = Math.hypot(rider.x - standing.x, rider.z - standing.z);
    expect(rider.pushX).toBeCloseTo(
      ((rider.x - standing.x) / away) * SHOVE.speed
    );
    expect(rider.pushZ).toBeCloseTo(
      ((rider.z - standing.z) / away) * SHOVE.speed
    );
  });

  it("stands the next member in a colour straight where the seat heard them", () => {
    let ids = ["near", "far"];
    const next = heardAt("next", standing.x + 0.5, standing.z + 0.5);
    const { heardShove, members, stance } = room({
      lobby: () => lobbyOf(ids),
      walkOf: (id) => (id === "next" ? next : standing),
    });
    members.step(FRAME, 0);
    heardShove("far", "near");
    ids = ["near", "next"];
    members.step(BLINK, 0);
    expect(members.spotOf(1)).toMatchObject({ x: next.x, z: next.z });
    expect(stance()?.shoving).toBe(0);
  });

  it("starts the walk to the door from where the figure stands", () => {
    let phase: SeatPhase = "lobby";
    const onTheFloor = heardAt("far", 1.5, 0.5);
    const { members } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => onTheFloor,
    });
    members.step(FRAME, 0);
    phase = "loading";
    members.step(TICK, 0);
    expect(movedFrom(members.spotOf(1), onTheFloor)).toBeLessThan(0.2);
  });

  it("keeps the walk to the door going over very short frames", () => {
    let phase: SeatPhase = "lobby";
    const { members } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    phase = "loading";
    for (let frame = 0; frame < 1200; frame += 1) {
      members.step(1 / 600, frame);
    }
    expect(movedFrom(members.spotOf(1), standing)).toBeGreaterThan(1);
  });

  it("brings a member to their own spot at the door and no further", () => {
    let phase: SeatPhase = "lobby";
    const { members } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    phase = "racing";
    for (let frame = 0; frame < 240; frame += 1) {
      members.step(FRAME, frame);
    }
    expect(movedFrom(members.spotOf(1), doorSpot(1))).toBeLessThan(0.3);
  });

  it("carries a shove in progress into the walk to the door", () => {
    let phase: SeatPhase = "lobby";
    const { heardShove, members, stance } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => ({ ...standing, place: "stool", pose: "chat" }),
    });
    members.step(FRAME, 0);
    heardShove("far", "near");
    phase = "loading";
    members.step(TICK, 0);
    expect(stance()).toMatchObject({ place: "foot", pose: null });
    expect(stance()?.shoving).toBeCloseTo(SHOVE.ticks - 1);
  });

  it("stands a member off their bike for the walk to the door", () => {
    let phase: SeatPhase = "lobby";
    const { members, showBike } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => ({ ...standing, place: "bike" }),
    });
    members.step(FRAME, 0);
    expect(showBike).toHaveBeenCalledWith(1);
    showBike.mockClear();
    phase = "loading";
    members.step(FRAME, 0);
    expect(showBike).not.toHaveBeenCalled();
    expect(members.spotOf(1)).toMatchObject({ mounted: false });
  });

  it("sends a member first heard after the race began to the door", () => {
    const { members, stance } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => "loading",
      walkOf: () => ({ ...standing, place: "stool", pose: "chat" }),
    });
    for (let frame = 0; frame < 240; frame += 1) {
      members.step(FRAME, frame);
    }
    expect(movedFrom(members.spotOf(1), doorSpot(1))).toBeLessThan(0.3);
    expect(stance()).toStrictEqual({ place: "foot", pose: null, shoving: 0 });
  });

  it("follows the seat again once the room has ended", () => {
    let phase: SeatPhase = "lobby";
    const { members } = room({
      lobby: () => lobbyOf(["near", "far"]),
      phase: () => phase,
      walkOf: () => standing,
    });
    members.step(FRAME, 0);
    phase = "racing";
    for (let frame = 0; frame < 40; frame += 1) {
      members.step(FRAME, frame);
    }
    expect(movedFrom(members.spotOf(1), standing)).toBeGreaterThan(4);
    phase = "ended";
    members.step(FRAME, 0);
    expect(members.spotOf(1)).toMatchObject({ x: standing.x, z: standing.z });
  });
});
