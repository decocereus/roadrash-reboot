import { describe, expect, it } from "vitest";

import { IN_THE_LOBBY, roleAfter, SOCKET_ROLES } from "../src/socket-role.ts";
import type {
  SocketEvent,
  SocketRole,
  SocketRoleKind,
} from "../src/socket-role.ts";

const RUN = "this race";
const SEAT = "this seat";

type Role = SocketRole<string, string>;
type Event = SocketEvent<string, string>;

const EVENTS = {
  graceOver: { kind: "graceOver" },
  raceBuilt: { kind: "raceBuilt", run: RUN, seat: SEAT },
  raceOver: { kind: "raceOver" },
} as const satisfies Record<Event["kind"], Event>;

const ROLES = {
  lobby: IN_THE_LOBBY,
  reporting: { kind: "reporting", seat: SEAT },
  seated: { kind: "seated", run: RUN, seat: SEAT },
} as const satisfies Record<SocketRoleKind, Role>;

const MOVES = {
  lobby: { graceOver: null, raceBuilt: "seated", raceOver: null },
  reporting: { graceOver: "lobby", raceBuilt: null, raceOver: null },
  seated: { graceOver: null, raceBuilt: null, raceOver: "reporting" },
} as const satisfies Record<
  SocketRoleKind,
  Record<Event["kind"], SocketRoleKind | null>
>;

const KINDS = [
  "graceOver",
  "raceBuilt",
  "raceOver",
] as const satisfies readonly Event["kind"][];

describe("the moves a socket may make", () => {
  it.each(
    SOCKET_ROLES.flatMap((from) =>
      KINDS.map((kind) => ({ from, kind, to: MOVES[from][kind] }))
    )
  )("$from hears $kind and becomes $to", ({ from, kind, to }) => {
    expect(roleAfter(ROLES[from], EVENTS[kind])?.kind ?? null).toBe(to);
  });

  it("takes its seat in the race it was built for, and keeps the seat to report on", () => {
    const seated = roleAfter<string, string>(IN_THE_LOBBY, EVENTS.raceBuilt);
    expect(seated).toStrictEqual(ROLES.seated);
    expect(roleAfter(ROLES.seated, EVENTS.raceOver)).toStrictEqual(
      ROLES.reporting
    );
  });

  it("goes back to the one lobby role once its grace is over", () => {
    expect(roleAfter(ROLES.reporting, EVENTS.graceOver)).toBe(IN_THE_LOBBY);
  });
});
