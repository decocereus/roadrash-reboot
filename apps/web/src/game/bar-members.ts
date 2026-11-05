import type { RoomLobbyMessage } from "@racer/rooms/messages";
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

interface Body {
  id: string | null;
  leaving: LobbyRider | null;
  leavingBacklog: number;
  shoving: number;
  walk: LobbyWalk | null;
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
  readonly step: (seconds: number, time: number) => void;
  readonly draw: (
    seconds: number,
    camera: THREE.Camera,
    size: { readonly width: number; readonly height: number }
  ) => void;
}

const newBody = (): Body => ({
  id: null,
  leaving: null,
  leavingBacklog: 0,
  shoving: 0,
  view: {
    heading: 0,
    lean: 0,
    mounted: false,
    pace: 0,
    stride: 0,
    x: 0,
    z: 0,
  },
  walk: null,
});

const followWalk = (body: Body, walk: LobbyWalk, seconds: number): void => {
  const { view } = body;
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
  body.shoving = Math.max(0, body.shoving - seconds * TICKS_PER_SECOND);
};

const headForDoor = (body: Body, slot: number, seconds: number): LobbyWalk => {
  let rider = body.leaving;
  if (!rider) {
    rider = createLobbyRider();
    rider.x = body.view.x;
    rider.z = body.view.z;
    rider.heading = body.view.heading;
    const spot = doorSpot(slot);
    sendRiderTo(rider, spot.x, spot.z);
    body.leaving = rider;
  }
  body.leavingBacklog += seconds;
  while (body.leavingBacklog >= LOBBY_TICK) {
    stepLobbyRider(rider, NO_CONTROL, 0, []);
    body.leavingBacklog -= LOBBY_TICK;
  }
  return walkOf(rider);
};

const memberWearing = (
  members: RoomLobbyMessage["members"],
  colour: number
): RoomLobbyMessage["members"][number] | undefined =>
  members.find((member) => member.colour === colour);

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
          sender.shoving = SHOVE.ticks;
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

  const moveBody = (
    index: number,
    id: string,
    name: string,
    walk: LobbyWalk,
    seconds: number
  ): void => {
    const body = bodies[index];
    const bike = bikes.roots[firstBike + index];
    if (!(body && bike)) {
      return;
    }
    if (body.id !== id) {
      body.id = id;
      body.shoving = 0;
      body.view.x = walk.x;
      body.view.z = walk.z;
    }
    body.walk = walk;
    followWalk(body, walk, seconds);
    const walker = walkers.at(index);
    walker.rename(name);
    walker.show(true);
    if (body.view.mounted) {
      bike.position.set(body.view.x, 0, body.view.z);
      bike.rotation.set(0, body.view.heading, body.view.lean);
      bikes.spin(firstBike + index, walk.pace * seconds);
      bikes.show(firstBike + index);
    }
    crowd.push(body.view);
  };

  return {
    crowd: () => crowd,
    draw(seconds, camera, size) {
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        const bike = bikes.roots[firstBike + index];
        if (body && body.id !== null && body.walk && bike) {
          const { pose, place } = body.walk;
          walkers
            .at(index)
            .update(
              { place, pose, shoving: body.shoving },
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
      const target = bodies[index];
      if (target && target.id !== null) {
        seat.act("greet", target.id);
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
        if (body && body.id !== null) {
          const away = hypot2(body.view.x - x, body.view.z - z);
          if (away < closest) {
            best = index;
            closest = away;
          }
        }
      }
      return best;
    },
    shove(index, _x, _z, time) {
      const target = bodies[index];
      if (target && target.id !== null) {
        seat.act("shove", target.id);
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
        const member = memberWearing(members, index);
        const heard =
          member?.here === true ? seat.walkOf(member.id) : undefined;
        if (index !== slot && member && heard && body) {
          moveBody(
            index,
            member.id,
            member.ready ? `${member.name}${READY_SUFFIX}` : member.name,
            begun ? headForDoor(body, index, seconds) : heard,
            seconds
          );
        } else if (body) {
          body.id = null;
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
