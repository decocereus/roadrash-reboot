import type { RoomWalked } from "@racer/rooms/messages";
import type { RoomSeat } from "@racer/rooms/seat-client";
import {
  angleOff,
  createLobbyRider,
  LOBBY_TICK,
  sendRiderTo,
  shoveRider,
  SHOVE,
  stepAsideAtSpawn,
  stepLobbyRider,
  walkOf,
} from "@racer/sim/lobby";
import type { LobbyRider } from "@racer/sim/lobby";
import { doorSpot } from "@racer/sim/lobby-floor";
import type { Spot } from "@racer/sim/lobby-floor";
import type { LobbyAct, LobbyWalk } from "@racer/sim/lobby-walk";
import { riderBlocks } from "@racer/sim/palette";
import { hypot2 } from "@racer/track/math";
import type * as THREE from "three";

import type { Bikes } from "./actors.ts";
import type { BarCompany } from "./bar-player.ts";
import type { BarSpeech } from "./bar-speech.ts";
import { SOLO_SLOT } from "./bar-walker.ts";
import type { BarWalkers, WalkerView } from "./bar-walker.ts";

const SEND_EVERY_SECONDS = 1 / 8;
const FOLLOW_RATE = 12;
const SNAP_METRES = 4;
const STRIDE_RUN_SPEED = 7;
const TICKS_PER_SECOND = 60;
const READY_SUFFIX = " READY";
const NO_CONTROL = { forward: 0, right: 0, sprint: false };
const YOU = "YOU";

interface Occupant {
  readonly memberId: string;
  shoving: number;
  walk: LobbyWalk;
}

type Occupied =
  | (Occupant & { readonly phase: "following" })
  | (Occupant & {
      readonly phase: "leaving";
      readonly rider: LobbyRider;
      backlog: number;
    });

type Presence = { readonly phase: "vacant" } | Occupied;

const VACANT: Presence = { phase: "vacant" };

interface Body {
  presence: Presence;
  readonly view: WalkerView;
}

interface MemberParts {
  readonly bikes: Pick<Bikes, "roots" | "show" | "spin">;
  readonly firstBike: number;
  readonly rider: LobbyRider;
  readonly seat: Pick<
    RoomSeat,
    "act" | "listen" | "lobby" | "phase" | "walk" | "walkOf"
  >;
  readonly speech: Pick<BarSpeech, "say">;
  readonly walkers: Pick<BarWalkers, "at" | "hide">;
}

export interface BarMembers extends BarCompany {
  readonly mine: () => number;
  readonly myLabel: () => string;
  readonly presence: () => readonly Presence[];
  readonly step: (seconds: number, time: number) => void;
  readonly draw: (
    seconds: number,
    camera: THREE.Camera,
    size: { readonly width: number; readonly height: number }
  ) => void;
}

const newBody = (): Body => ({
  presence: VACANT,
  view: {
    heading: 0,
    lean: 0,
    mounted: false,
    pace: 0,
    stride: 0,
    x: 0,
    z: 0,
  },
});

const followWalk = (
  view: WalkerView,
  occupant: Occupied,
  seconds: number
): void => {
  const { walk } = occupant;
  const ease = Math.min(1, seconds * FOLLOW_RATE);
  const far = hypot2(walk.x - view.x, walk.z - view.z) > SNAP_METRES;
  const share = far ? 1 : ease;
  view.x += (walk.x - view.x) * share;
  view.z += (walk.z - view.z) * share;
  view.heading += angleOff(view.heading, walk.heading) * share;
  view.lean += (walk.lean - view.lean) * ease;
  view.pace = walk.pace;
  view.stride += (walk.pace / STRIDE_RUN_SPEED) * seconds;
  view.mounted = walk.place === "bike";
  occupant.shoving = Math.max(0, occupant.shoving - seconds * TICKS_PER_SECOND);
};

const followingFrom = (heard: RoomWalked, shoving: number): Occupied => ({
  memberId: heard.member,
  phase: "following",
  shoving,
  walk: heard,
});

const leavingFrom = (
  view: WalkerView,
  slot: number,
  heard: RoomWalked,
  shoving: number
): Occupied => {
  const rider = createLobbyRider();
  rider.x = view.x;
  rider.z = view.z;
  rider.heading = view.heading;
  const spot = doorSpot(slot);
  sendRiderTo(rider, spot.x, spot.z);
  return {
    backlog: 0,
    memberId: heard.member,
    phase: "leaving",
    rider,
    shoving,
    walk: heard,
  };
};

const presenceAfter = (
  presence: Presence,
  view: WalkerView,
  slot: number,
  heard: RoomWalked,
  begun: boolean
): Occupied => {
  switch (presence.phase) {
    case "vacant": {
      return begun
        ? leavingFrom(view, slot, heard, 0)
        : followingFrom(heard, 0);
    }
    case "following": {
      return begun
        ? leavingFrom(view, slot, heard, presence.shoving)
        : presence;
    }
    case "leaving": {
      return begun ? presence : followingFrom(heard, presence.shoving);
    }
    default: {
      return presence satisfies never;
    }
  }
};

const walkNow = (
  occupant: Occupied,
  heard: LobbyWalk,
  seconds: number
): LobbyWalk => {
  switch (occupant.phase) {
    case "following": {
      return heard;
    }
    case "leaving": {
      occupant.backlog += seconds;
      while (occupant.backlog >= LOBBY_TICK) {
        stepLobbyRider(occupant.rider, NO_CONTROL, 0, []);
        occupant.backlog -= LOBBY_TICK;
      }
      return walkOf(occupant.rider);
    }
    default: {
      return occupant satisfies never;
    }
  }
};

const moveBody = (
  body: Body,
  slot: number,
  heard: RoomWalked,
  begun: boolean,
  seconds: number
): Occupied => {
  const { presence: before, view } = body;
  const arriving =
    before.phase === "vacant" || before.memberId !== heard.member;
  const presence = presenceAfter(
    arriving ? VACANT : before,
    view,
    slot,
    heard,
    begun
  );
  body.presence = presence;
  presence.walk = walkNow(presence, heard, seconds);
  if (arriving) {
    view.x = presence.walk.x;
    view.z = presence.walk.z;
  }
  followWalk(view, presence, seconds);
  return presence;
};

export const createMembers = ({
  bikes,
  firstBike,
  rider,
  seat,
  speech,
  walkers,
}: MemberParts): BarMembers => {
  const bodies = riderBlocks.map(newBody);
  const crowd: Spot[] = [];
  let slot = SOLO_SLOT;
  let placed = false;
  let sinceSent = 0;
  let lastSent = "";
  let now = 0;

  const slotOf = (id: string): number =>
    seat.lobby()?.members.find((member) => member.id === id)?.colour ?? -1;

  const heardAct = (act: LobbyAct, from: string, target: string): void => {
    const fromSlot = slotOf(from);
    const targetSlot = slotOf(target);
    if (fromSlot < 0 || targetSlot < 0) {
      return;
    }
    const sender = bodies[fromSlot];
    const targetHead = walkers.at(targetSlot).head;
    switch (act) {
      case "greet": {
        speech.say("YO", walkers.at(fromSlot).head, now);
        speech.say("SUP", targetHead, now);
        break;
      }
      case "shove": {
        speech.say("OI!", targetHead, now);
        if (sender) {
          if (sender.presence.phase !== "vacant") {
            sender.presence.shoving = SHOVE.ticks;
          }
          if (targetSlot === slot) {
            shoveRider(rider, sender.view.x, sender.view.z);
          }
        }
        break;
      }
      default: {
        act satisfies never;
      }
    }
  };

  seat.listen({
    onActed: ({ act, from, target }) => {
      heardAct(act, from, target);
    },
  });

  const sendMine = (seconds: number): void => {
    sinceSent += seconds;
    if (sinceSent >= SEND_EVERY_SECONDS) {
      sinceSent = 0;
      const walk = walkOf(rider);
      const text = JSON.stringify(walk);
      if (text !== lastSent) {
        lastSent = text;
        seat.walk(walk);
      }
    }
  };

  const placeMe = (): void => {
    const lobby = seat.lobby();
    const mine = lobby ? slotOf(lobby.you) : -1;
    if (mine >= 0) {
      slot = mine;
      if (!placed) {
        placed = true;
        stepAsideAtSpawn(rider, mine);
      }
    }
  };

  return {
    crowd: () => crowd,
    draw(seconds, camera, size) {
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        const bike = bikes.roots[firstBike + index];
        if (body && body.presence.phase !== "vacant" && bike) {
          const { shoving, walk } = body.presence;
          walkers
            .at(index)
            .update(
              { place: walk.place, pose: walk.pose, shoving },
              body.view,
              bike,
              now,
              seconds,
              camera,
              size
            );
        }
      }
    },
    greet(index, _x, _z, time) {
      const target = bodies[index]?.presence;
      if (target && target.phase !== "vacant") {
        seat.act("greet", target.memberId);
        speech.say("SUP", walkers.at(index).head, time);
      }
    },
    mine: () => slot,
    myLabel: () =>
      seat.lobby()?.members.find(({ colour }) => colour === slot)?.ready ===
      true
        ? `${YOU}${READY_SUFFIX}`
        : YOU,
    nearest(x, z, reach) {
      let best: number | null = null;
      let closest = reach;
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        if (body && body.presence.phase !== "vacant") {
          const away = hypot2(body.view.x - x, body.view.z - z);
          if (away < closest) {
            best = index;
            closest = away;
          }
        }
      }
      return best;
    },
    presence: () => bodies.map(({ presence }) => presence),
    shove(index, _x, _z, time) {
      const target = bodies[index]?.presence;
      if (target && target.phase !== "vacant") {
        seat.act("shove", target.memberId);
        speech.say("OI!", walkers.at(index).head, time);
      }
    },
    spotOf: (index) => bodies[index]?.view ?? null,
    step(seconds, time) {
      now = time;
      placeMe();
      crowd.length = 0;
      const members = seat.lobby()?.members ?? [];
      const phase = seat.phase();
      const begun = phase === "loading" || phase === "racing";
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        const bike = bikes.roots[firstBike + index];
        const member = members.find(({ colour }) => colour === index);
        const heard =
          member?.here === true ? seat.walkOf(member.id) : undefined;
        if (index !== slot && member && heard && body && bike) {
          const { walk } = moveBody(body, index, heard, begun, seconds);
          const { view } = body;
          const walker = walkers.at(index);
          walker.rename(
            member.ready ? `${member.name}${READY_SUFFIX}` : member.name
          );
          walker.show(true);
          if (view.mounted) {
            bike.position.set(view.x, 0, view.z);
            bike.rotation.set(0, view.heading, view.lean);
            bikes.spin(firstBike + index, walk.pace * seconds);
            bikes.show(firstBike + index);
          }
          crowd.push(view);
        } else if (body) {
          body.presence = VACANT;
          if (index !== slot) {
            walkers.hide(index);
          }
        }
      }
      if (placed && !begun) {
        sendMine(seconds);
      }
    },
  };
};
