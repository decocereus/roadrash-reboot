import type { RoomChoice, RoomRule } from "@racer/career/room-race";
import { MOST_SEATS } from "@racer/sim/room";

import { msOf } from "./room-config.ts";
import type { RoomConfig } from "./room-config.ts";
import type { RoomKind } from "./room-id.ts";
import type { LobbyMemory } from "./room-memory.ts";

export const LOBBY_PHASES = ["gathering", "racing"] as const;

type LobbyPhase = (typeof LOBBY_PHASES)[number];

const minus = (at: number | null, now: number): number | null =>
  at === null ? null : at - now;

interface Member {
  readonly colour: number;
  readonly id: string;
  readonly key: string;
  arrived: boolean;
  awaySince: number | null;
  name: string;
  ready: boolean;
  rttMs: number | null;
}

interface LobbyMemberView {
  readonly colour: number;
  readonly here: boolean;
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly rttMs: number | null;
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
  readonly arrive: (id: string) => void;
  readonly away: (id: string, now: number) => void;
  readonly choose: (id: string, choice: Partial<RoomChoice>) => boolean;
  readonly colourOf: (id: string) => number;
  readonly due: (now: number) => boolean;
  readonly join: (key: string, name: string, now: number) => string | null;
  readonly leave: (id: string, now: number) => void;
  readonly memory: () => LobbyMemory;
  readonly raceEnded: (now: number) => void;
  readonly raceStarted: () => void;
  readonly ready: (
    id: string,
    ready: boolean,
    edition: number,
    now: number
  ) => void;
  readonly roundTrip: (id: string, rttMs: number | null) => boolean;
  readonly rule: () => RoomRule;
  readonly since: () => number;
  readonly size: () => number;
  readonly sweep: (now: number) => boolean;
  readonly view: (now: number) => LobbyView;
}

export const createLobby = (
  bornAt: number,
  kind: RoomKind,
  config: RoomConfig,
  freshRule: () => RoomRule,
  memory: LobbyMemory | null = null
): Lobby => {
  let members: Member[] = (memory?.members ?? []).map(
    ({ colour, id, key, name }) => ({
      arrived: true,
      awaySince: bornAt,
      colour,
      id,
      key,
      name,
      ready: false,
      rttMs: null,
    })
  );
  let joined = memory?.joined ?? 0;
  let rule = memory?.rule ?? freshRule();
  let edition = 0;
  let phase: LobbyPhase = "gathering";
  let clockFrom: number | null = null;
  let since = bornAt;

  const here = (): readonly Member[] =>
    members.filter((member) => member.awaySince === null);

  const hostOf = (): Member | null =>
    kind === "public" ? null : (here()[0] ?? members[0] ?? null);

  const freeColour = (): number => {
    let colour = 0;
    while (members.some((member) => member.colour === colour)) {
      colour += 1;
    }
    return colour;
  };

  const clockRuns = {
    custom: () => members.some((member) => member.ready),
    public: () => here().length > 0,
  } as const satisfies Record<RoomKind, () => boolean>;

  const waitMs = {
    custom: msOf(config.customStartSeconds),
    public: msOf(config.publicStartSeconds),
  } as const satisfies Record<RoomKind, number>;

  const earliestMs = {
    custom: 0,
    public: msOf(config.publicGatherSeconds),
  } as const satisfies Record<RoomKind, number>;

  const keep = (kept: (member: Member) => boolean): boolean => {
    const before = members.length;
    members = members.filter(kept);
    if (members.length === 0) {
      rule = freshRule();
      edition += 1;
    }
    return members.length !== before;
  };

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
    arrive: (id) => {
      for (const member of members) {
        if (member.id === id) {
          member.arrived = true;
        }
      }
    },
    away: (id, now) => {
      keep((member) => member.id !== id || member.arrived);
      for (const member of members) {
        if (member.id === id) {
          member.awaySince = now;
          member.ready = false;
          member.rttMs = null;
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
    colourOf: (id) => {
      const member = members.find((each) => each.id === id);
      if (!member) {
        throw new RangeError(`No member ${id} in this lobby.`);
      }
      return member.colour;
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
      members.push({
        arrived: false,
        awaySince: null,
        colour: freeColour(),
        id,
        key,
        name,
        ready: false,
        rttMs: null,
      });
      settleClock(now);
      return id;
    },
    leave: (id, now) => {
      keep((member) => member.id !== id);
      settleClock(now);
    },
    memory: () => ({
      joined,
      members: members.flatMap(({ arrived, colour, id, key, name }) =>
        arrived ? [{ colour, id, key, name }] : []
      ),
      rule,
    }),
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
    roundTrip: (id, rttMs) => {
      const member = members.find((each) => each.id === id);
      if (member === undefined || member.rttMs === rttMs) {
        return false;
      }
      member.rttMs = rttMs;
      return true;
    },
    rule: () => rule,
    since: () => since,
    size: () => members.length,
    sweep: (now) =>
      keep(
        ({ awaySince }) =>
          awaySince === null || now - awaySince < msOf(config.awaySeconds)
      ),
    view: (now) => ({
      edition,
      hostId: hostOf()?.id ?? null,
      members: members.map(({ awaySince, colour, id, name, ready, rttMs }) => ({
        colour,
        here: awaySince === null,
        id,
        name,
        ready,
        rttMs,
      })),
      phase,
      roomKind: kind,
      rule,
      startsInMs: phase === "gathering" ? minus(startsAt(), now) : null,
    }),
  };
};
