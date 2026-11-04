import { publicRoomRule } from "@racer/career/room-race";
import type { RoomChoice, RoomRule } from "@racer/career/room-race";
import { MOST_SEATS } from "@racer/sim/room";

export const READY_WAIT_MS = 60_000;
export const AWAY_MS = 120_000;

export const LOBBY_PHASES = ["gathering", "racing"] as const;

type LobbyPhase = (typeof LOBBY_PHASES)[number];

interface Member {
  readonly id: string;
  readonly key: string;
  awaySince: number | null;
  name: string;
  ready: boolean;
}

interface LobbyMemberView {
  readonly here: boolean;
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
}

interface LobbyView {
  readonly edition: number;
  readonly hostId: string | null;
  readonly members: readonly LobbyMemberView[];
  readonly phase: LobbyPhase;
  readonly rule: RoomRule;
  readonly startsInMs: number | null;
}

export interface Lobby {
  readonly away: (id: string, now: number) => void;
  readonly choose: (id: string, choice: RoomChoice) => boolean;
  readonly due: (now: number) => boolean;
  readonly join: (key: string, name: string, now: number) => string | null;
  readonly raceEnded: (now: number) => void;
  readonly raceStarted: () => void;
  readonly ready: (
    id: string,
    ready: boolean,
    edition: number,
    now: number
  ) => void;
  readonly rule: () => RoomRule;
  readonly since: () => number;
  readonly size: () => number;
  readonly sweep: (now: number) => boolean;
  readonly view: (now: number) => LobbyView;
}

export const createLobby = (bornAt: number): Lobby => {
  let members: Member[] = [];
  let joined = 0;
  let rule: RoomRule = publicRoomRule;
  let edition = 0;
  let phase: LobbyPhase = "gathering";
  let firstReadyAt: number | null = null;
  let since = bornAt;

  const here = (): readonly Member[] =>
    members.filter((member) => member.awaySince === null);

  const hostOf = (): Member | null => here()[0] ?? members[0] ?? null;

  const clearReady = (): void => {
    for (const member of members) {
      member.ready = false;
    }
    firstReadyAt = null;
  };

  const keepTimerHonest = (): void => {
    if (!members.some((member) => member.ready)) {
      firstReadyAt = null;
    }
  };

  return {
    away: (id, now) => {
      for (const member of members) {
        if (member.id === id) {
          member.awaySince = now;
          member.ready = false;
        }
      }
      keepTimerHonest();
    },
    choose: (id, choice) => {
      if (hostOf()?.id !== id || phase !== "gathering") {
        return false;
      }
      rule = { ...rule, ...choice };
      edition += 1;
      clearReady();
      return true;
    },
    due: (now) =>
      phase === "gathering" &&
      here().length > 0 &&
      (members.every((member) => member.ready) ||
        (firstReadyAt !== null && now >= firstReadyAt + READY_WAIT_MS)),
    join: (key, name, now) => {
      const known = members.find((member) => member.key === key);
      if (known) {
        known.awaySince = null;
        known.name = name;
        return known.id;
      }
      if (members.length >= MOST_SEATS) {
        return null;
      }
      if (members.length === 0) {
        since = now;
      }
      joined += 1;
      const id = `m${joined}`;
      members.push({ awaySince: null, id, key, name, ready: false });
      return id;
    },
    raceEnded: (now) => {
      phase = "gathering";
      since = now;
      clearReady();
    },
    raceStarted: () => {
      phase = "racing";
      clearReady();
    },
    ready: (id, ready, seen, now) => {
      if (phase !== "gathering" || (ready && seen !== edition)) {
        return;
      }
      for (const member of members) {
        if (member.id === id) {
          member.ready = ready;
        }
      }
      keepTimerHonest();
      if (ready) {
        firstReadyAt ??= now;
      }
    },
    rule: () => rule,
    since: () => since,
    size: () => members.length,
    sweep: (now) => {
      const before = members.length;
      members = members.filter(
        ({ awaySince }) => awaySince === null || now - awaySince < AWAY_MS
      );
      if (members.length === 0) {
        rule = publicRoomRule;
        edition += 1;
      }
      return members.length !== before;
    },
    view: (now) => ({
      edition,
      hostId: hostOf()?.id ?? null,
      members: members.map(({ awaySince, id, name, ready }) => ({
        here: awaySince === null,
        id,
        name,
        ready,
      })),
      phase,
      rule,
      startsInMs:
        firstReadyAt === null ? null : firstReadyAt + READY_WAIT_MS - now,
    }),
  };
};
