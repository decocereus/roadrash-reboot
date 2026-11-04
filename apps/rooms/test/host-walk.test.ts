import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { encodeLobbyCommand } from "../src/messages.ts";
import {
  createClock,
  fakeSocket,
  lastLobby,
  nearby,
  race,
  sameBuild,
} from "./host-harness.ts";

const WALK = {
  heading: 1.5,
  lean: 0,
  pace: 4.4,
  place: "foot",
  pose: null,
  x: 2,
  z: -3,
} as const;

const walkCommand = encodeLobbyCommand({ ...WALK, kind: "walk" });

const room = () => {
  const clock = createClock();
  const host = createHost(clock);
  const seated = (): ReturnType<typeof fakeSocket> => {
    const socket = fakeSocket();
    host.seat(socket, "Guest", nearby, sameBuild());
    return socket;
  };
  return { clock, host, seated };
};

describe("riders walking the lobby", () => {
  it("tells the others where a rider is, and names who moved", () => {
    const { host, seated } = room();
    const walker = seated();
    const other = seated();
    host.message(walker, walkCommand);
    expect(other.messages.at(-1)).toStrictEqual({
      ...WALK,
      kind: "walk",
      member: lastLobby(walker).you,
    });
    expect(walker.messages.some(({ kind }) => kind === "walk")).toBeFalsy();
  });

  it("sends no lobby update for a step, because a step changes no lobby rule", () => {
    const { host, seated } = room();
    const walker = seated();
    const other = seated();
    const before = other.messages.length;
    host.message(walker, walkCommand);
    host.message(walker, walkCommand);
    expect(other.messages).toHaveLength(before + 2);
  });

  it("tells a late arrival where everyone already stands", () => {
    const { host, seated } = room();
    const walker = seated();
    host.message(walker, walkCommand);
    const late = seated();
    expect(late.messages.filter(({ kind }) => kind === "walk")).toStrictEqual([
      { ...WALK, kind: "walk", member: lastLobby(walker).you },
    ]);
  });

  it("forgets a rider who left", () => {
    const { host, seated } = room();
    const walker = seated();
    host.message(walker, walkCommand);
    host.gone(walker, 1000);
    const late = seated();
    expect(late.messages.some(({ kind }) => kind === "walk")).toBeFalsy();
  });

  it("passes a shove on with the real sender, whatever the client claims", () => {
    const { host, seated } = room();
    const shover = seated();
    const shoved = seated();
    const target = lastLobby(shoved).you;
    host.message(
      shover,
      encodeLobbyCommand({ act: "shove", kind: "act", target })
    );
    expect(shoved.messages.at(-1)).toStrictEqual({
      act: "shove",
      from: lastLobby(shover).you,
      kind: "act",
      target,
    });
  });

  it("keeps lobby steps away from riders in a race", () => {
    const { clock, host } = room();
    const racers = [fakeSocket(), fakeSocket()];
    race(host, clock, racers);
    const [first, second] = racers;
    if (!(first && second)) {
      throw new Error("The race has no riders.");
    }
    const before = second.messages.length;
    host.message(first, walkCommand);
    expect(second.messages).toHaveLength(before);
  });
});
