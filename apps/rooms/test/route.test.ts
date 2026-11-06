import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { gateRules } from "../src/gate.ts";
import { decodeRoomMessage } from "../src/messages.ts";
import { decodeQueueMessage } from "../src/queue-messages.ts";
import { route } from "../src/route.ts";

const ROOM = "abcd1234";
const SEAT = `/rooms/${ROOM}/seat`;
const QUEUE_SEAT = "/queue/seat";

type Reached = "queue" | "refused" | "room";

const openDoors = () => {
  const counts = new Map<string, number>();
  const refusals: string[] = [];
  const reach = (
    path: string,
    address: string | null,
    headers: Record<string, string>
  ): Effect.Effect<Reached> => {
    const request = HttpServerRequest.fromWeb(
      new Request(`http://rooms${path}`, { headers })
    ).modify({ remoteAddress: Option.fromNullOr(address) });
    return route(request, {
      pass: (door, client) =>
        Effect.sync(() => {
          const key = `${door} ${client}`;
          const count = (counts.get(key) ?? 0) + 1;
          counts.set(key, count);
          return count <= gateRules[door].limit;
        }),
      queue: () =>
        Effect.succeed(HttpServerResponse.text("queue", { status: 200 })),
      refuse: (message) => {
        refusals.push(message);
        return HttpServerResponse.text("refused", { status: 101 });
      },
      room: () =>
        Effect.succeed(HttpServerResponse.text("room", { status: 200 })),
    }).pipe(
      Effect.map((response): Reached => {
        if (response.status === 101) {
          return "refused";
        }
        return path.startsWith("/queue") ? "queue" : "room";
      })
    );
  };
  const many = (
    times: number,
    path: string,
    address: string | null
  ): readonly Reached[] =>
    Array.from({ length: times }, () =>
      Effect.runSync(reach(path, address, { upgrade: "websocket" }))
    );
  const look = (path: string, address: string): Reached =>
    Effect.runSync(reach(path, address, {}));
  return { look, many, refusals };
};

describe("the rooms Worker's gates", () => {
  it("seats a client up to the seat limit and refuses the next seat with a limited refusal", () => {
    const doors = openDoors();
    const { limit } = gateRules.seat;
    expect(doors.many(limit + 1, SEAT, "203.0.113.7")).toStrictEqual([
      ...Array.from({ length: limit }, () => "room"),
      "refused",
    ]);
    const [message] = doors.refusals;
    expect(Option.getOrNull(decodeRoomMessage(message))).toStrictEqual({
      kind: "refused",
      reason: "limited",
    });
  });

  it("keeps seating another client while one client is refused", () => {
    const doors = openDoors();
    doors.many(gateRules.seat.limit + 1, SEAT, "203.0.113.7");
    expect(doors.many(1, SEAT, "198.51.100.20")).toStrictEqual(["room"]);
    expect(doors.look(`/rooms/${ROOM}`, "203.0.113.7")).toBe("room");
  });

  it("counts queue tickets apart from seats and refuses them in the queue's own words", () => {
    const doors = openDoors();
    const { limit } = gateRules.queue;
    doors.many(gateRules.seat.limit + 1, SEAT, "203.0.113.7");
    expect(doors.many(limit + 1, QUEUE_SEAT, "203.0.113.7")).toStrictEqual([
      ...Array.from({ length: limit }, () => "queue"),
      "refused",
    ]);
    expect(
      Option.getOrNull(decodeQueueMessage(doors.refusals.at(-1)))
    ).toStrictEqual({ kind: "refused", reason: "limited" });
  });

  it.each([
    ["/queue/seat/", "queue"],
    ["/queue/%73eat", "queue"],
    [`/rooms/${ROOM}/SEAT`, "seat"],
  ] as const)("counts a seat sent to %s against the %s limit", (path, door) => {
    const doors = openDoors();
    const { limit } = gateRules[door];
    expect(doors.many(limit + 1, path, "203.0.113.7").at(-1)).toBe("refused");
  });

  it("counts every address in one IPv6 /64 as one client", () => {
    const doors = openDoors();
    const { limit } = gateRules.seat;
    const rotating = Array.from(
      { length: limit + 1 },
      (_, host) => `2001:db8:a:b::${(host + 1).toString(16)}`
    ).flatMap((address) => doors.many(1, SEAT, address));
    expect(rotating.at(-1)).toBe("refused");
    expect(doors.many(1, SEAT, "2001:db8:a:c::1")).toStrictEqual(["room"]);
  });

  it("leaves local runs with no edge address or a loopback address ungated", () => {
    const doors = openDoors();
    const over = gateRules.seat.limit * 2;
    expect(doors.many(over, SEAT, null)).not.toContain("refused");
    expect(doors.many(over, SEAT, "127.0.0.1")).not.toContain("refused");
    expect(doors.many(over, SEAT, "::1")).not.toContain("refused");
  });
});
