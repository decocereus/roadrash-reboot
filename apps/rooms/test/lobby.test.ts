import { publicRoomRule } from "@racer/career/room-race";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { AWAY_MS, READY_WAIT_MS } from "../src/lobby.ts";
import { encodeLobbyCommand } from "../src/messages.ts";
import { TapeHeaderSchema } from "../src/tape.ts";
import {
  advanceHearing,
  createClock,
  fakeSocket,
  lastLobby,
  nearby,
  readyAll,
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
  const clock = createClock();
  const host = createHost(clock);
  const first = fakeSocket();
  const second = fakeSocket();
  host.seat(first, "Ann", nearby, sameBuild("ann"));
  host.seat(second, "Bo", nearby, sameBuild("bo"));
  return { clock, first, host, second };
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
  it("waits for ever while nobody is ready", () => {
    const { clock, first, host, second } = twoSeated();
    advanceHearing(host, clock, [first, second], READY_WAIT_MS * 3);
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
    expect(lastLobby(second).startsInMs).toBe(READY_WAIT_MS);
    advanceHearing(host, clock, [first, second], READY_WAIT_MS - 1000);
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
    advanceHearing(host, clock, [first, second], READY_WAIT_MS + 1000);
    expect(host.status().phase).toBe("waiting");
  });

  it("gives a rider who is away the minute to come back", () => {
    const { clock, first, host, second } = twoSeated();
    host.gone(second);
    readyAll(host, [first]);
    expect(host.status().phase).toBe("waiting");
    advanceHearing(host, clock, [first], READY_WAIT_MS + 1000);
    expect(host.status().phase).toBe("racing");
    expect(startedOf(first).manifest.roster[1]?.kind).toBe("ai");
  });
});

describe("a lobby's rules", () => {
  it("are the host's to choose, and reach the race and its tape", () => {
    const { clock, first, host, second } = twoSeated();
    choose(host, second);
    expect(lastLobby(first).rule).toStrictEqual(publicRoomRule);
    choose(host, first);
    expect(lastLobby(second).rule).toMatchObject(somewhereElse);
    readyAll(host, [first, second]);
    expect(startedOf(second).manifest.rule).toMatchObject(somewhereElse);
    const header = clock.tape.get("tapes/race-1/header.json");
    expect(decodeHeader(header).rule).toMatchObject(somewhereElse);
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
    host.gone(first);
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
    host.gone(first);
    host.gone(second);
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
    host.gone(first);
    advanceHearing(host, clock, [second], AWAY_MS + 2000);
    expect(lastLobby(second).members).toHaveLength(1);
    host.gone(second);
    clock.advance(AWAY_MS + 2000);
    const next = fakeSocket();
    host.seat(next, "Cy", nearby, sameBuild());
    expect(lastLobby(next).rule).toStrictEqual(publicRoomRule);
  });

  it("seats a late rider for the next race, not this one", () => {
    const { clock, first, host, second } = twoSeated();
    readyAll(host, [first, second]);
    const late = fakeSocket();
    host.seat(late, "Cy", nearby, sameBuild("cy"));
    expect(late.closed).toBeNull();
    expect(lastLobby(late).phase).toBe("racing");
    host.gone(first);
    host.gone(second);
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
