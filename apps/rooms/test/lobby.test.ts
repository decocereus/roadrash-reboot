import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { encodeLobbyCommand } from "../src/messages.ts";
import { TapeHeaderSchema } from "../src/tape.ts";
import {
  advanceHearing,
  AWAY_MS,
  createClock,
  CUSTOM_START_MS,
  fakeSocket,
  lastLobby,
  nearby,
  pingPacket,
  PUBLIC_GATHER_MS,
  PUBLIC_RULE,
  PUBLIC_START_MS,
  readyAll,
  room,
  sameBuild,
  startedOf,
} from "./host-harness.ts";
import type { FakeSocket } from "./host-harness.ts";

const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(TapeHeaderSchema)
);

const somewhereElse = {
  police: "none",
  roadId: "breakwater-run",
  tier: 3,
  traffic: "heavy",
} as const;

const twoSeated = () => {
  const { clock, host, seated } = room();
  return {
    clock,
    first: seated("ann", "Ann"),
    host,
    second: seated("bo", "Bo"),
  };
};

const choose = (
  host: ReturnType<typeof createHost>,
  socket: FakeSocket
): void => {
  host.message(
    socket,
    encodeLobbyCommand({ choice: somewhereElse, kind: "choose" })
  );
};

describe("a lobby's start", () => {
  it("keeps a member's colour when someone leaves, and reuses the free one", () => {
    const clock = createClock();
    const host = createHost(clock);
    const [first, second, third, fourth] = [
      fakeSocket(),
      fakeSocket(),
      fakeSocket(),
      fakeSocket(),
    ];
    host.seat(first, "Ann", nearby, sameBuild("ann"));
    host.seat(second, "Bo", nearby, sameBuild("bo"));
    host.seat(third, "Cy", nearby, sameBuild("cy"));
    host.gone(second, 1000);
    advanceHearing(host, clock, [first, third], AWAY_MS + 1000);
    const colours = () =>
      new Map(
        lastLobby(third).members.map((member) => [member.name, member.colour])
      );
    expect(colours()).toStrictEqual(
      new Map([
        ["Ann", 0],
        ["Cy", 2],
      ])
    );
    host.seat(fourth, "Di", nearby, sameBuild("di"));
    expect(colours().get("Di")).toBe(1);
  });

  it("waits for ever while nobody is ready", () => {
    const { clock, first, host, second } = twoSeated();
    advanceHearing(host, clock, [first, second], CUSTOM_START_MS * 3);
    expect(host.status().phase).toBe("waiting");
    expect(lastLobby(first).startsInMs).toBeNull();
  });

  it("starts the moment everyone here is ready", () => {
    const { first, host, second } = twoSeated();
    readyAll(host, [first]);
    expect(host.status().phase).toBe("waiting");
    readyAll(host, [second]);
    expect(host.status().phase).toBe("racing");
  });

  it("starts with everyone a minute after the first rider readied", () => {
    const { clock, first, host, second } = twoSeated();
    readyAll(host, [first]);
    expect(lastLobby(second).startsInMs).toBe(CUSTOM_START_MS);
    advanceHearing(host, clock, [first, second], CUSTOM_START_MS - 1000);
    expect(host.status().phase).toBe("waiting");
    advanceHearing(host, clock, [first, second], 1000);
    expect(host.status().phase).toBe("racing");
    expect(startedOf(second).manifest.roster[1]?.name).toBe("Bo");
  });

  it("stops the minute when the only ready rider takes it back", () => {
    const { clock, first, host, second } = twoSeated();
    readyAll(host, [first]);
    host.message(
      first,
      encodeLobbyCommand({ edition: 0, kind: "ready", ready: false })
    );
    expect(lastLobby(second).startsInMs).toBeNull();
    advanceHearing(host, clock, [first, second], CUSTOM_START_MS + 1000);
    expect(host.status().phase).toBe("waiting");
  });

  it("gives a rider who is away the minute to come back", () => {
    const { clock, first, host, second } = twoSeated();
    host.gone(second, 1000);
    readyAll(host, [first]);
    expect(host.status().phase).toBe("waiting");
    advanceHearing(host, clock, [first], CUSTOM_START_MS + 1000);
    expect(host.status().phase).toBe("racing");
    expect(startedOf(first).manifest.roster[1]?.kind).toBe("ai");
  });
});

const publicRoom = () => {
  const clock = createClock();
  const host = createHost(clock, "public");
  const first = fakeSocket();
  const second = fakeSocket();
  host.seat(first, "Ann", nearby, sameBuild("ann"));
  host.seat(second, "Bo", nearby, sameBuild("bo"));
  return { clock, first, host, second };
};

describe("a public lobby", () => {
  it("has no host, and nobody can change its rules", () => {
    const { first, host, second } = publicRoom();
    const { rule } = lastLobby(second);
    expect(lastLobby(first).hostId).toBeNull();
    expect(lastLobby(first).roomKind).toBe("public");
    choose(host, first);
    expect(lastLobby(second).rule).toStrictEqual(rule);
    expect(rule.tier).toBe(2);
  });

  it("leaves on its timer with nobody ready", () => {
    const { clock, first, host, second } = publicRoom();
    advanceHearing(host, clock, [first, second], PUBLIC_START_MS - 1000);
    expect(host.status().phase).toBe("waiting");
    advanceHearing(host, clock, [first, second], 2000);
    expect(host.status().phase).toBe("racing");
  });

  it("waits a moment for riders still arriving, even if all are ready", () => {
    const { clock, first, host, second } = publicRoom();
    readyAll(host, [first, second]);
    expect(host.status().phase).toBe("waiting");
    advanceHearing(host, clock, [first, second], PUBLIC_GATHER_MS + 1000);
    expect(host.status().phase).toBe("racing");
  });
});

describe("a lobby's rules", () => {
  it("are the host's to choose, and reach the race and its tape", () => {
    const { clock, first, host, second } = twoSeated();
    choose(host, second);
    expect(lastLobby(first).rule).toStrictEqual(PUBLIC_RULE);
    choose(host, first);
    expect(lastLobby(second).rule).toMatchObject(somewhereElse);
    readyAll(host, [first, second]);
    expect(startedOf(second).manifest.rule).toMatchObject(somewhereElse);
    const header = clock.tape.get("tapes/race-1/header.json");
    expect(decodeHeader(header).rule).toMatchObject(somewhereElse);
  });

  it("keep a quick pick the room hadn't answered yet", () => {
    const { first, host, second } = twoSeated();
    const pick = (choice: { roadId: "slag-row" } | { tier: 3 }): void => {
      host.message(first, encodeLobbyCommand({ choice, kind: "choose" }));
    };
    pick({ roadId: "slag-row" });
    pick({ tier: 3 });
    expect(lastLobby(second).rule).toMatchObject({
      roadId: "slag-row",
      tier: 3,
    });
  });

  it("clear everyone's ready when they change", () => {
    const { first, host, second } = twoSeated();
    readyAll(host, [second]);
    choose(host, first);
    expect(lastLobby(first).members.map((each) => each.ready)).toStrictEqual([
      false,
      false,
    ]);
    expect(lastLobby(first).startsInMs).toBeNull();
  });

  it("leave a Ready sent before a change unheard, so nobody races on rules they didn't see", () => {
    const { first, host, second } = twoSeated();
    const seen = lastLobby(second).edition;
    choose(host, first);
    readyAll(host, [first]);
    host.message(
      second,
      encodeLobbyCommand({ edition: seen, kind: "ready", ready: true })
    );
    expect(host.status().phase).toBe("waiting");
    expect(lastLobby(second).members.map((each) => each.ready)).toStrictEqual([
      true,
      false,
    ]);
  });

  it("go to the next oldest rider while the host is away, and back", () => {
    const { clock, first, host, second } = twoSeated();
    const hostId = lastLobby(first).you;
    host.gone(first, 1000);
    expect(lastLobby(second).hostId).toBe(lastLobby(second).you);
    clock.advance(1000);
    const back = fakeSocket();
    host.seat(back, "Ann", nearby, sameBuild("ann"));
    expect(lastLobby(back).hostId).toBe(hostId);
  });
});

describe("a lobby across races", () => {
  it("keeps its riders and rules, and the server makes the next race", () => {
    const { clock, first, host, second } = twoSeated();
    const ids = lastLobby(second).members.map((member) => member.id);
    choose(host, first);
    readyAll(host, [first, second]);
    host.gone(first, 1000);
    host.gone(second, 1000);
    clock.advance(AWAY_MS / 2);
    expect(host.status().phase).toBe("waiting");
    const backOne = fakeSocket();
    const backTwo = fakeSocket();
    host.seat(backOne, "Ann", nearby, sameBuild("ann"));
    host.seat(backTwo, "Bo", nearby, sameBuild("bo"));
    expect(lastLobby(backTwo).members.map((each) => each.id)).toStrictEqual(
      ids
    );
    expect(lastLobby(backTwo).rule).toMatchObject(somewhereElse);
    readyAll(host, [backOne, backTwo]);
    const { manifest } = startedOf(backTwo);
    expect(manifest.raceId).toBe("race-2");
    expect(manifest.rule).toMatchObject(somewhereElse);
  });

  it("forgets a rider who stays away, and its rules once nobody is left", () => {
    const { clock, first, host, second } = twoSeated();
    choose(host, first);
    host.gone(first, 1000);
    advanceHearing(host, clock, [second], AWAY_MS + 2000);
    expect(lastLobby(second).members).toHaveLength(1);
    host.gone(second, 1000);
    clock.advance(AWAY_MS + 2000);
    const next = fakeSocket();
    host.seat(next, "Cy", nearby, sameBuild());
    expect(lastLobby(next).rule).toStrictEqual(PUBLIC_RULE);
  });

  it("seats a late rider for the next race, not this one", () => {
    const { clock, first, host, second } = twoSeated();
    readyAll(host, [first, second]);
    const late = fakeSocket();
    host.seat(late, "Cy", nearby, sameBuild("cy"));
    expect(late.closed).toBeNull();
    expect(lastLobby(late).phase).toBe("racing");
    host.gone(first, 1000);
    host.gone(second, 1000);
    advanceHearing(host, clock, [late], 120_000);
    expect(lastLobby(late).phase).toBe("gathering");
    readyAll(host, [late]);
    expect(startedOf(late).manifest.raceId).toBe("race-2");
  });

  it("gives a rider who sits down twice one member and one socket", () => {
    const { first, host } = twoSeated();
    const again = fakeSocket();
    host.seat(again, "Ann", nearby, sameBuild("ann"));
    expect(first.closed).not.toBeNull();
    expect(first.messages.at(-1)).toStrictEqual({
      kind: "refused",
      reason: "replaced",
    });
    expect(lastLobby(again).members).toHaveLength(2);
    expect(host.status().waiting).toBe(2);
  });
});

const roundTrips = (socket: FakeSocket) =>
  new Map(
    lastLobby(socket).members.map((member) => [member.name, member.rttMs])
  );

const lobbiesTo = (socket: FakeSocket): number =>
  socket.messages.filter((message) => message.kind === "lobby").length;

describe("a lobby's round trips", () => {
  it("shows everyone the round trip each member's pings carry, within a second", () => {
    const { clock, first, host, second } = twoSeated();
    host.message(first, pingPacket(48));
    clock.advance(1000);
    expect(roundTrips(second)).toStrictEqual(
      new Map([
        ["Ann", 48],
        ["Bo", null],
      ])
    );
  });

  it("tells nobody again while every round trip stays the same", () => {
    const { clock, first, host, second } = twoSeated();
    host.message(first, pingPacket(48));
    clock.advance(1000);
    const told = lobbiesTo(second);
    host.message(first, pingPacket(48));
    host.message(second, pingPacket());
    clock.advance(1000);
    expect(lobbiesTo(second)).toBe(told);
  });

  it("forgets the round trip of a member who goes away", () => {
    const { clock, first, host, second } = twoSeated();
    host.message(first, pingPacket(48));
    clock.advance(1000);
    host.gone(first, 1000);
    expect(roundTrips(second).get("Ann")).toBeNull();
  });
});
