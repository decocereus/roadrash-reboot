import { RACE_STATS_PACKET_BYTES } from "@racer/sim/room-wire";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRoomMessage, SEAT_CLOSED } from "../src/messages.ts";
import { NEW_SEAT, seatAfter } from "../src/seat-client.ts";
import type { RoomSeat, SeatEvent, SeatPhase } from "../src/seat-client.ts";
import {
  ABNORMAL_CLOSE,
  countdown,
  DEAD_AFTER_MS,
  ended,
  FakeSocket,
  hearTick,
  lobbyAt,
  lobbyMessage,
  loadingSeat,
  newSeat,
  PING_EVERY_MS,
  replaced,
  started,
  startedMessage,
} from "./seat-socket.ts";

const LIVE_ROADS = [
  { heard: [], phase: "connecting", raced: false },
  { heard: [lobbyAt(1)], phase: "lobby", raced: false },
  { heard: [lobbyAt(1), started], phase: "loading", raced: true },
  { heard: [lobbyAt(1), started, countdown], phase: "racing", raced: true },
] as const;

describe("a seat's way through a room", () => {
  beforeEach(() => {
    FakeSocket.opened = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rides from the lobby to the end of a race and tells its listeners each step", () => {
    const { seat, socket } = newSeat();
    const told: string[] = [];
    seat.listen({
      onChange: () => {
        told.push(seat.phase());
      },
    });
    const walked = [seat.phase()];
    for (const message of [lobbyAt(1), started, countdown, ended]) {
      socket.hear(message);
      walked.push(seat.phase());
    }
    expect(walked).toStrictEqual([
      "connecting",
      "lobby",
      "loading",
      "racing",
      "ended",
    ]);
    expect(told).toStrictEqual(["lobby", "loading", "racing", "ended"]);
  });

  it("has no race in the lobby and keeps the same one from loading to the end", () => {
    const { seat, socket } = newSeat();
    socket.hear(lobbyAt(1));
    expect(seat.race()).toBeNull();
    socket.hear(started);
    const race = seat.race();
    expect(race?.raceId).toBe("race-1");
    socket.hear(countdown);
    expect(seat.race()).toBe(race);
    socket.hear(ended);
    expect(seat.race()).toBe(race);
  });

  it("closes its socket when the race ends and stays ended when the socket closes", () => {
    const { seat, socket } = loadingSeat();
    socket.hear(countdown);
    socket.hear(ended);
    expect(socket.closedWith).toBe(SEAT_CLOSED);
    expect(seat.closeCode()).toBeNull();
    socket.closedByBrowser();
    expect(seat.phase()).toBe("ended");
    expect(seat.closeCode()).toBe(SEAT_CLOSED);
  });

  it("tells its listeners about every lobby change", () => {
    const { seat, socket } = newSeat();
    const editions: (number | undefined)[] = [];
    seat.listen({
      onChange: () => {
        editions.push(seat.lobby()?.edition);
      },
    });
    socket.hear(lobbyAt(1));
    socket.hear(lobbyAt(2));
    expect(editions).toStrictEqual([1, 2]);
  });

  it("sends its race stats once when the race ends", () => {
    const { socket } = loadingSeat();
    socket.hear(countdown);
    socket.hear(ended);
    socket.closedByBrowser();
    expect(
      socket.sentBytes.filter((bytes) => bytes === RACE_STATS_PACKET_BYTES)
    ).toHaveLength(1);
  });

  it("leaves from the lobby and stays left when the socket closes", () => {
    const { seat, socket } = newSeat();
    socket.hear(lobbyAt(1));
    seat.leave();
    expect(seat.phase()).toBe("left");
    expect(socket.closedWith).toBe(SEAT_CLOSED);
    socket.closedByBrowser();
    expect(seat.phase()).toBe("left");
    expect(seat.closeCode()).toBe(SEAT_CLOSED);
    expect(socket.sentBytes).toStrictEqual([]);
  });

  it.each(LIVE_ROADS)(
    "is lost when the socket drops during $phase",
    ({ heard, phase, raced }) => {
      const { seat, socket } = newSeat();
      for (const message of heard) {
        socket.hear(message);
      }
      expect(seat.phase()).toBe(phase);
      socket.droppedByRoom(ABNORMAL_CLOSE);
      expect(seat.phase()).toBe("lost");
      expect(seat.closeCode()).toBe(ABNORMAL_CLOSE);
      expect(seat.race() !== null).toBe(raced);
      expect(seat.refusal()).toBeNull();
    }
  );

  it("is refused in the lobby with the room's reason", () => {
    const { seat, socket } = newSeat();
    socket.hear(lobbyAt(1));
    socket.hear(replaced);
    expect(seat.phase()).toBe("refused");
    expect(seat.refusal()).toBe("replaced");
    expect(seat.race()).toBeNull();
    expect(socket.closedWith).toBe(SEAT_CLOSED);
  });

  it("is lost with the room's reason and keeps its race when refused during a race", () => {
    const { seat, socket } = loadingSeat();
    socket.hear(countdown);
    const race = seat.race();
    socket.hear(replaced);
    expect(seat.phase()).toBe("lost");
    expect(seat.refusal()).toBe("replaced");
    expect(seat.race()).toBe(race);
  });

  it("is lost from the lobby once its pings go unanswered", () => {
    const { seat, socket } = newSeat();
    socket.answers = false;
    socket.hear(lobbyAt(1));
    vi.advanceTimersByTime(DEAD_AFTER_MS);
    expect(seat.phase()).toBe("lobby");
    vi.advanceTimersByTime(2 * PING_EVERY_MS);
    expect(seat.phase()).toBe("lost");
    expect(socket.closedWith).toBe(SEAT_CLOSED);
  });

  it("rides on with its pings unanswered while room ticks keep arriving", () => {
    const { seat, socket } = loadingSeat();
    socket.hear(countdown);
    socket.answers = false;
    for (let second = 1; second <= 12; second += 1) {
      hearTick(socket, second);
      vi.advanceTimersByTime(1000);
    }
    expect(seat.phase()).toBe("racing");
  });

  it("is lost when room ticks stop during a race even though pings are answered", () => {
    const { seat, socket } = loadingSeat();
    socket.hear(countdown);
    vi.advanceTimersByTime(PING_EVERY_MS);
    hearTick(socket, 1);
    vi.advanceTimersByTime(DEAD_AFTER_MS);
    expect(seat.phase()).toBe("racing");
    vi.advanceTimersByTime(2 * PING_EVERY_MS);
    expect(seat.phase()).toBe("lost");
  });

  it.each([
    {
      finish: (socket: FakeSocket) => {
        socket.hear(ended);
      },
      phase: "ended",
    },
    {
      finish: (socket: FakeSocket) => {
        socket.droppedByRoom(ABNORMAL_CLOSE);
      },
      phase: "lost",
    },
  ])("stops pinging once it is $phase", ({ finish, phase }) => {
    const { seat, socket } = loadingSeat();
    socket.hear(countdown);
    finish(socket);
    expect(seat.phase()).toBe(phase);
    const sent = socket.sentBytes.length;
    vi.advanceTimersByTime(10 * PING_EVERY_MS);
    expect(socket.sentBytes).toHaveLength(sent);
  });

  it("tells its listeners when it leaves", () => {
    const { seat } = newSeat();
    const onChange = vi.fn<() => void>();
    seat.listen({ onChange });
    seat.leave();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("stops pinging once it leaves", () => {
    const { seat, socket } = newSeat();
    seat.leave();
    vi.advanceTimersByTime(10 * PING_EVERY_MS);
    expect(socket.sentBytes).toStrictEqual([]);
  });
});

const ENDINGS = [
  {
    finish: (_seat: RoomSeat, socket: FakeSocket) => {
      for (const message of [lobbyAt(1), started, countdown, ended]) {
        socket.hear(message);
      }
    },
    phase: "ended",
  },
  {
    finish: (seat: RoomSeat, socket: FakeSocket) => {
      socket.hear(lobbyAt(1));
      seat.leave();
    },
    phase: "left",
  },
  {
    finish: (_seat: RoomSeat, socket: FakeSocket) => {
      for (const message of [lobbyAt(1), started, countdown]) {
        socket.hear(message);
      }
      socket.droppedByRoom(ABNORMAL_CLOSE);
    },
    phase: "lost",
  },
  {
    finish: (_seat: RoomSeat, socket: FakeSocket) => {
      socket.hear(lobbyAt(1));
      socket.hear(replaced);
    },
    phase: "refused",
  },
] as const;

describe("a seat that is over", () => {
  beforeEach(() => {
    FakeSocket.opened = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(ENDINGS)(
    "stays $phase when a late lobby arrives, and tells nobody",
    ({ finish, phase }) => {
      const { seat, socket } = newSeat();
      finish(seat, socket);
      const onChange = vi.fn<() => void>();
      seat.listen({ onChange });
      socket.hear(lobbyAt(2));
      expect(seat.phase()).toBe(phase);
      expect(seat.lobby()?.edition).toBe(1);
      expect(onChange).not.toHaveBeenCalled();
    }
  );

  it.each(ENDINGS)(
    "stays $phase with the same race when a late start arrives",
    ({ finish, phase }) => {
      const { seat, socket } = newSeat();
      finish(seat, socket);
      const race = seat.race();
      socket.hear(started);
      socket.hear(countdown);
      expect(seat.phase()).toBe(phase);
      expect(seat.race()).toBe(race);
    }
  );

  it.each(ENDINGS)(
    "stays $phase with its first reason when a late refusal arrives",
    ({ finish, phase }) => {
      const { seat, socket } = newSeat();
      finish(seat, socket);
      const reason = seat.refusal();
      socket.hear(encodeRoomMessage({ kind: "refused", reason: "full" }));
      expect(seat.phase()).toBe(phase);
      expect(seat.refusal()).toBe(reason);
    }
  );

  it.each(ENDINGS)(
    "stays $phase when the rider leaves after it",
    ({ finish, phase }) => {
      const { seat, socket } = newSeat();
      finish(seat, socket);
      seat.leave();
      expect(seat.phase()).toBe(phase);
    }
  );

  it("stays refused and stops pinging while its socket is still closing", () => {
    const { seat, socket } = newSeat();
    socket.answers = false;
    socket.hear(lobbyAt(1));
    socket.hear(replaced);
    const sent = socket.sentBytes.length;
    vi.advanceTimersByTime(4 * DEAD_AFTER_MS);
    expect(seat.phase()).toBe("refused");
    expect(socket.sentBytes).toHaveLength(sent);
  });
});

const EVENTS = {
  closed: { kind: "closed" },
  countdown: { kind: "countdown", startAtMs: 0 },
  ended: { kind: "ended", tick: 0 },
  left: { kind: "left" },
  lobby: lobbyMessage(1),
  refused: { kind: "refused", reason: "replaced" },
  silent: { kind: "silent" },
  started: startedMessage,
} satisfies Record<SeatEvent["kind"], SeatEvent>;

const GATHERING = {
  closed: "lost",
  countdown: null,
  ended: null,
  left: "left",
  lobby: "lobby",
  refused: "refused",
  silent: "lost",
  started: "loading",
} as const;

const OVER = {
  closed: null,
  countdown: null,
  ended: null,
  left: null,
  lobby: null,
  refused: null,
  silent: null,
  started: null,
} as const;

const MOVES = {
  connecting: GATHERING,
  ended: OVER,
  left: OVER,
  loading: {
    ...OVER,
    closed: "lost",
    countdown: "racing",
    left: "left",
    refused: "lost",
    silent: "lost",
  },
  lobby: GATHERING,
  lost: OVER,
  racing: {
    ...OVER,
    closed: "lost",
    ended: "ended",
    left: "left",
    refused: "lost",
    silent: "lost",
  },
  refused: OVER,
} as const satisfies Record<
  SeatPhase,
  Record<SeatEvent["kind"], SeatPhase | null>
>;

const ROADS_TO = {
  connecting: [],
  ended: ["lobby", "started", "countdown", "ended"],
  left: ["left"],
  loading: ["lobby", "started"],
  lobby: ["lobby"],
  lost: ["closed"],
  racing: ["lobby", "started", "countdown"],
  refused: ["refused"],
} as const satisfies Record<SeatPhase, readonly SeatEvent["kind"][]>;

const PHASES = [
  "connecting",
  "ended",
  "left",
  "loading",
  "lobby",
  "lost",
  "racing",
  "refused",
] as const satisfies readonly SeatPhase[];

const KINDS = [
  "closed",
  "countdown",
  "ended",
  "left",
  "lobby",
  "refused",
  "silent",
  "started",
] as const satisfies readonly SeatEvent["kind"][];

const seatIn = (phase: SeatPhase) => {
  let state = NEW_SEAT;
  for (const kind of ROADS_TO[phase]) {
    const next = seatAfter(state, EVENTS[kind]);
    if (!next) {
      throw new Error(`A seat cannot reach ${phase} by ${kind}.`);
    }
    state = next;
  }
  return state;
};

describe("the moves a seat may make", () => {
  it.each(
    PHASES.flatMap((from) =>
      KINDS.map((kind) => ({ from, kind, to: MOVES[from][kind] }))
    )
  )("$from hears $kind and becomes $to", ({ from, kind, to }) => {
    expect(seatAfter(seatIn(from), EVENTS[kind])?.phase ?? null).toBe(to);
  });

  it("carries its race from loading through racing to every way out", () => {
    const racing = seatIn("racing");
    const followers = (
      ["ended", "closed", "silent", "left", "refused"] as const
    ).map((kind) => seatAfter(racing, EVENTS[kind])?.race);
    expect(new Set(followers)).toStrictEqual(new Set([racing.race]));
    expect(racing.race).not.toBeNull();
  });
});
