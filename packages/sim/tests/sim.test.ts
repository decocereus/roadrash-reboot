import { describe, expect, test } from "bun:test";
import {
  botInput,
  createRace,
  inputFor,
  stepRace,
  type RaceState,
  type RiderInput,
} from "../src/index";

const stepWith = (
  state: RaceState,
  inputByRider: Record<string, RiderInput>,
  ticks = 1,
): RaceState => {
  let next = state;
  for (let tick = 0; tick < ticks; tick += 1) next = stepRace(next, inputByRider);
  return next;
};

describe("shared race simulation", () => {
  test("fills a four-rider race with deterministic bots", () => {
    const first = stepWith(
      createRace({ riders: [{ id: "player", name: "Player" }], seed: 42 }),
      { player: inputFor({ throttle: 1 }) },
      30,
    );
    const second = stepWith(
      createRace({ riders: [{ id: "player", name: "Player" }], seed: 42 }),
      { player: inputFor({ throttle: 1 }) },
      30,
    );

    expect(first.riders).toHaveLength(4);
    expect(first.riders.filter((rider) => rider.kind === "bot")).toHaveLength(3);
    expect(first).toEqual(second);
  });

  test("throttle advances road-relative distance and steer changes lane", () => {
    const start = createRace({ riders: [{ id: "player", name: "Player", lane: 0 }] });
    const end = stepWith(start, { player: inputFor({ throttle: 1, steer: 1 }) }, 30);
    const rider = end.riders.find((candidate) => candidate.id === "player");
    expect(rider).toBeDefined();
    expect(rider?.roadDistance).toBeGreaterThan(0);
    expect(rider?.lane).toBeGreaterThan(0);
  });

  test("the bike builds speed over several seconds and does not stop in one brake tap", () => {
    const start = createRace({ traffic: [] });
    const spaced: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "player" ? rider : { ...rider, roadDistance: -100 },
      ),
    };
    const accelerating = stepWith(spaced, { player: inputFor({ throttle: 1 }) }, 90);
    const speed = accelerating.riders.find((rider) => rider.id === "player")?.speed ?? 0;
    expect(speed * 3.6).toBeGreaterThan(60);
    expect(speed * 3.6).toBeLessThan(100);
    const braking = stepRace(accelerating, { player: inputFor({ brake: 1 }) });
    expect(braking.riders.find((rider) => rider.id === "player")?.speed).toBeGreaterThan(speed - 1);
  });

  test("steering carries briefly after the key is released", () => {
    const start = createRace({ riders: [{ id: "player", name: "Player", lane: 0 }], traffic: [] });
    const moving: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "player" ? { ...rider, speed: 25 } : rider,
      ),
    };
    const steered = stepRace(moving, { player: inputFor({ throttle: 1, steer: 1 }) });
    const released = stepRace(steered, { player: inputFor({ throttle: 1 }) });
    const firstLane = steered.riders.find((rider) => rider.id === "player")?.lane ?? 0;
    const secondLane = released.riders.find((rider) => rider.id === "player")?.lane ?? 0;
    expect(secondLane).toBeGreaterThan(firstLane);
  });

  test("stationary bikes touching do not throw a rider off", () => {
    const start = createRace({
      riders: [
        { id: "left", name: "Left", kind: "human" },
        { id: "right", name: "Right", kind: "human" },
      ],
      traffic: [],
    });
    const touching: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "left" || rider.id === "right"
          ? { ...rider, lane: 0, roadDistance: 10, speed: 0 }
          : rider,
      ),
    };
    const next = stepRace(touching);
    expect(next.riders.filter((rider) => rider.status === "crashed")).toHaveLength(0);
    expect(next.events.some((event) => event.kind === "rider-collision")).toBe(false);
  });

  test("a light side contact slows riders without a knockdown", () => {
    const start = createRace({ traffic: [] });
    const close: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "player"
          ? { ...rider, lane: 0, roadDistance: 10, speed: 12 }
          : rider.id === "bot-2"
            ? { ...rider, lane: 0.48, lateralVelocity: -0.8, roadDistance: 10, speed: 12 }
            : { ...rider, roadDistance: -50 },
      ),
    };
    const next = stepRace(close, { player: inputFor(), "bot-2": inputFor() });
    expect(next.events.some((event) => event.kind === "rider-collision")).toBe(true);
    expect(next.riders.filter((rider) => rider.status === "crashed")).toHaveLength(0);
  });

  test("a fast rear impact knocks down the rider who hits from behind", () => {
    const start = createRace({ traffic: [] });
    const close: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "player"
          ? { ...rider, lane: 0, roadDistance: 10, speed: 30 }
          : rider.id === "bot-2"
            ? { ...rider, lane: 0, roadDistance: 10.6, speed: 8 }
            : { ...rider, roadDistance: -50 },
      ),
    };
    const next = stepRace(close, { player: inputFor(), "bot-2": inputFor() });
    expect(next.riders.find((rider) => rider.id === "player")?.status).toBe("crashed");
    expect(next.riders.find((rider) => rider.id === "bot-2")?.status).toBe("active");
  });

  test("the starting grid avoids an immediate bike pile-up and traffic moves", () => {
    const start = createRace({
      seed: 9,
      traffic: [{ id: "car", kind: "vehicle", lane: 0, distance: 50, speed: 30 }],
    });
    const next = stepRace(start);
    expect(next.events.some((event) => event.kind === "rider-collision")).toBe(false);
    expect(next.traffic[0]?.distance).toBeGreaterThan(50);
  });

  test("a bot at the left edge steers onto the road to pass a rider ahead", () => {
    const start = createRace({ traffic: [] });
    const blocked: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "bot-2"
          ? { ...rider, lane: -1, roadDistance: 10, speed: 24 }
          : rider.id === "player"
            ? { ...rider, lane: -1, roadDistance: 18, speed: 12 }
            : { ...rider, roadDistance: -50 },
      ),
    };
    const bot = blocked.riders.find((rider) => rider.id === "bot-2");
    expect(bot).toBeDefined();
    if (bot) expect(botInput(blocked, bot).steer).toBe(1);
  });

  test("attack has a range and cooldown, and health decreases on a hit", () => {
    const start = createRace({
      riders: [
        { id: "attacker", name: "Attacker", lane: 0 },
        { id: "target", name: "Target", lane: 0 },
      ],
      traffic: [],
    });
    const close: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "target" ? { ...rider, roadDistance: 2 } : rider,
      ),
    };
    const hit = stepRace(close, { attacker: inputFor({ attack: true }), target: inputFor() });
    const target = hit.riders.find((rider) => rider.id === "target");
    expect(hit.events.some((event) => event.kind === "hit")).toBe(true);
    expect(target?.health).toBe(76);
    const cooldown = stepRace(hit, { attacker: inputFor({ attack: true }) });
    expect(cooldown.events.filter((event) => event.kind === "hit")).toHaveLength(0);
  });

  test("attacks outside range do not hit", () => {
    const start = createRace({
      riders: [
        { id: "attacker", name: "Attacker", lane: 0 },
        { id: "target", name: "Target", lane: 0 },
      ],
      traffic: [],
    });
    const far: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "target" ? { ...rider, roadDistance: 20 } : rider,
      ),
    };
    const next = stepRace(far, { attacker: inputFor({ attack: true }) });
    expect(next.events.some((event) => event.kind === "hit")).toBe(false);
    expect(next.riders.find((rider) => rider.id === "target")?.health).toBe(100);
  });

  test("traffic collision crashes, then recovers", () => {
    const start = createRace({
      riders: [{ id: "player", name: "Player", lane: 0 }],
      traffic: [{ id: "barrier", kind: "obstacle", lane: 0, distance: 0.5 }],
    });
    const approaching: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "player" ? { ...rider, speed: 24 } : rider,
      ),
    };
    const crashed = stepRace(approaching, { player: inputFor({ throttle: 1 }) });
    const player = crashed.riders.find((rider) => rider.id === "player");
    expect(player?.status).toBe("crashed");
    expect(crashed.events.some((event) => event.kind === "traffic-collision")).toBe(true);

    const recovered = stepWith(crashed, { player: inputFor({ throttle: 1 }) }, 24);
    expect(recovered.riders.find((rider) => rider.id === "player")?.status).toBe("active");
    expect(recovered.events.some((event) => event.kind === "recover")).toBe(true);
  });

  test("a bike resting beside traffic does not crash", () => {
    const start = createRace({
      riders: [{ id: "player", name: "Player", lane: 0 }],
      traffic: [{ id: "parked", kind: "obstacle", lane: 0, distance: 0.5 }],
    });
    const next = stepRace(start, { player: inputFor() });
    expect(next.riders.find((rider) => rider.id === "player")?.status).toBe("active");
    expect(next.events.some((event) => event.kind === "traffic-collision")).toBe(false);
  });

  test("finish places are assigned authoritatively in crossing order", () => {
    const start = createRace({
      trackLength: 100,
      riders: [
        { id: "first", name: "First", lane: -1 },
        { id: "second", name: "Second", lane: 1 },
      ],
      traffic: [],
    });
    const moved: RaceState = {
      ...start,
      riders: start.riders.map((rider) =>
        rider.id === "first"
          ? { ...rider, roadDistance: 99.9, speed: 10 }
          : rider.id === "second"
            ? { ...rider, roadDistance: 99.8, speed: 10 }
            : rider,
      ),
    };
    const finish = stepRace(moved, {
      first: inputFor({ throttle: 1 }),
      second: inputFor({ throttle: 1 }),
    });
    expect(finish.riders.find((rider) => rider.id === "first")?.place).toBe(1);
    expect(finish.riders.find((rider) => rider.id === "second")?.place).toBe(2);
  });

  test("the race deadline assigns remaining places by distance and ends the room", () => {
    const start = createRace({
      maxDurationSeconds: 1,
      trackLength: 1_000,
      traffic: [],
      riders: [
        { id: "alpha", name: "Alpha" },
        { id: "bravo", name: "Bravo" },
        { id: "charlie", name: "Charlie" },
        { id: "delta", name: "Delta" },
      ],
    });
    const nearDeadline: RaceState = {
      ...start,
      tick: 29,
      elapsedSeconds: 29 / 30,
      riders: start.riders.map((rider) => ({
        ...rider,
        roadDistance:
          rider.id === "alpha" ? 40 : rider.id === "bravo" ? 20 : rider.id === "charlie" ? 30 : 10,
      })),
    };
    const deadline = stepRace(nearDeadline, {
      alpha: inputFor(),
      bravo: inputFor(),
      charlie: inputFor(),
      delta: inputFor(),
    });

    expect(deadline.phase).toBe("finished");
    expect(deadline.finishCount).toBe(4);
    expect(deadline.riders.map((rider) => [rider.id, rider.place])).toEqual([
      ["alpha", 1],
      ["bravo", 3],
      ["charlie", 2],
      ["delta", 4],
    ]);
    expect(deadline.events.filter((event) => event.kind === "finish")).toHaveLength(4);
  });
});
