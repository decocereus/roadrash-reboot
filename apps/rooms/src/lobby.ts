import type { RoomChoice, RoomRule } from "@racer/career/room-race";
import { MOST_SEATS } from "@racer/sim/room";

import type { RoomKind } from "./room-id.ts";

export const READY_WAIT_MS = 60_000;
export const PUBLIC_WAIT_MS = 45_000;
export const PUBLIC_GATHER_MS = 10_000;
export const AWAY_MS = 120_000;

export const LOBBY_PHASES = ["gathering", "racing"] as const;

type LobbyPhase = (typeof LOBBY_PHASES)[number];

const minus = (at: number | null, now: number): number | null =>
  at === null ? null : at - now;

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
  readonly roomKind: RoomKind;
  readonly rule: RoomRule;
  readonly startsInMs: number | null;
}

export interface Lobby {
  readonly away: (id: string, now: number) => void;
  readonly choose: (id: string, choice: Partial<RoomChoice>) => boolean;
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

export const createLobby = (
  bornAt: number,
  kind: RoomKind,
  freshRule: () => RoomRule
): Lobby => {
  let members: Member[] = [];
  let joined = 0;
  let rule = freshRule();
  let edition = 0;
  let phase: LobbyPhase = "gathering";
  let clockFrom: number | null = null;
  let since = bornAt;

  const here = (): readonly Member[] =>
    members.filter((member) => member.awaySince === null);

  const hostOf = (): Member | null =>
    kind === "public" ? null : (here()[0] ?? members[0] ?? null);

  const clockRuns = {
    custom: () => members.some((member) => member.ready),
    public: () => here().length > 0,
  } as const satisfies Record<RoomKind, () => boolean>;

  const waitMs = {
    custom: READY_WAIT_MS,
    public: PUBLIC_WAIT_MS,
  } as const satisfies Record<RoomKind, number>;

  const earliestMs = {
    custom: 0,
    public: PUBLIC_GATHER_MS,
  } as const satisfies Record<RoomKind, number>;

  const settleClock = (now: number): void => {
    clockFrom =
      phase === "gathering" && clockRuns[kind]() ? (clockFrom ?? now) : null;
  };

  const clearReady = (): void => {
    for (const member of members) {
      member.ready = false;
    }
    clockFrom = null;
  };

  const startsAt = (): number | null => {
    if (clockFrom === null) {
      return null;
    }
    return (
      clockFrom +
      (members.every((member) => member.ready)
        ? earliestMs[kind]
        : waitMs[kind])
    );
  };

  return {
    away: (id, now) => {
      for (const member of members) {
        if (member.id === id) {
          member.awaySince = now;
          member.ready = false;
        }
      }
      settleClock(now);
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
    due: (now) => {
      const at = startsAt();
      return (
        phase === "gathering" && here().length > 0 && at !== null && now >= at
      );
    },
    join: (key, name, now) => {
      const known = members.find((member) => member.key === key);
      if (known) {
        known.awaySince = null;
        known.name = name;
        settleClock(now);
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
      settleClock(now);
      return id;
    },
    raceEnded: (now) => {
      phase = "gathering";
      since = now;
      clearReady();
      if (kind === "public") {
        rule = freshRule();
        edition += 1;
      }
      settleClock(now);
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
      settleClock(now);
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
        rule = freshRule();
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
      roomKind: kind,
      rule,
      startsInMs: phase === "gathering" ? minus(startsAt(), now) : null,
    }),
  };
};
