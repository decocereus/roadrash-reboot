import { describe, expect, it } from "vitest";

import { FURNITURE, heightOfSolidsAt, PLINTH, STOOLS } from "./lobby-floor.ts";
import {
  atTheTaps,
  createLobbyRider,
  holdPose,
  LOBBY_TICK,
  pullTheTaps,
  respawnRider,
  sendRiderTo,
  shoveRider,
  sitOnStool,
  standUp,
  startShove,
  stepLobbyRider,
  stoolNear,
  toggleBike,
} from "./lobby.ts";
import type { LobbyRider } from "./lobby.ts";

const STILL = { forward: 0, right: 0, sprint: false };
const AHEAD = { forward: 1, right: 0, sprint: false };

const walk = (rider: LobbyRider, seconds: number, control = STILL): void => {
  for (let tick = 0; tick < seconds / LOBBY_TICK; tick += 1) {
    stepLobbyRider(rider, control, 0, []);
  }
};

const arrive = (rider: LobbyRider, x: number, z: number): void => {
  sendRiderTo(rider, x, z);
  for (let tick = 0; rider.target && tick < 3600; tick += 1) {
    stepLobbyRider(rider, STILL, 0, []);
  }
};

const sampleRun = (): LobbyRider => {
  const rider = createLobbyRider();
  arrive(rider, -8, -1);
  walk(rider, 1, { forward: 1, right: 1, sprint: true });
  return rider;
};

const behindTheTaps = { x: FURNITURE.taps.x, z: FURNITURE.taps.z - 1 };

describe("walking the bar", () => {
  it("holds the rider to the floor when they run at a solid", () => {
    const rider = createLobbyRider();
    rider.x = PLINTH.x;
    rider.z = PLINTH.z + PLINTH.radius + 1.5;
    walk(rider, 3, AHEAD);
    expect(heightOfSolidsAt(rider.x, rider.z)).toBe(0);
    expect(rider.z).toBeGreaterThan(PLINTH.z);
  });

  it("walks around the plinth to a clicked spot on its far side", () => {
    const rider = createLobbyRider();
    arrive(rider, -8, -1);
    expect(rider.x).toBeCloseTo(-8, 0);
    expect(rider.z).toBeCloseTo(-1, 0);
  });

  it("stops at the nearest floor when the click lands on furniture", () => {
    const rider = createLobbyRider();
    arrive(rider, FURNITURE.pool.x, FURNITURE.pool.z);
    expect(heightOfSolidsAt(rider.x, rider.z)).toBe(0);
    expect(rider.target).toBeNull();
  });

  it("gives up a click when a key takes over", () => {
    const rider = createLobbyRider();
    sendRiderTo(rider, -8, -1);
    stepLobbyRider(rider, AHEAD, 0, []);
    expect(rider.target).toBeNull();
    expect(rider.route).toHaveLength(0);
  });

  it("repeats a run exactly from the same inputs", () => {
    expect(sampleRun()).toStrictEqual(sampleRun());
  });
});

describe("the hidden bike", () => {
  it("stays locked from the customers' side of the taps", () => {
    const rider = createLobbyRider();
    arrive(rider, FURNITURE.taps.x, FURNITURE.taps.z + 1);
    expect(atTheTaps(rider)).toBeFalsy();
    expect(pullTheTaps(rider)).toBeFalsy();
    expect(toggleBike(rider)).toBeFalsy();
    expect(rider.place.kind).toBe("foot");
  });

  it("unlocks once, for a rider who walks round behind the bar", () => {
    const rider = createLobbyRider();
    arrive(rider, behindTheTaps.x, behindTheTaps.z);
    expect(atTheTaps(rider)).toBeTruthy();
    expect(pullTheTaps(rider)).toBeTruthy();
    expect(pullTheTaps(rider)).toBeFalsy();
    expect(toggleBike(rider)).toBeTruthy();
    expect(rider.place.kind).toBe("bike");
  });

  it("brings the bike out front, because it cannot fit through the gap", () => {
    const rider = createLobbyRider();
    arrive(rider, behindTheTaps.x, behindTheTaps.z);
    pullTheTaps(rider);
    toggleBike(rider);
    expect(rider.z).toBeGreaterThan(FURNITURE.counterZ);
    walk(rider, 1, AHEAD);
    walk(rider, 1, { forward: -1, right: 0, sprint: false });
    expect(rider.pace).toBeGreaterThan(1);
  });

  it("rides faster than a jog and leans into a turn", () => {
    const rider = createLobbyRider();
    rider.bikeFound = true;
    rider.x = -2;
    rider.z = 9.5;
    toggleBike(rider);
    walk(rider, 1.2, { forward: 0, right: 1, sprint: false });
    expect(rider.pace).toBeGreaterThan(4.4);
    expect(Math.abs(rider.lean)).toBeGreaterThan(0.05);
  });

  it("steps the rider clear of the bike when they get off", () => {
    const rider = createLobbyRider();
    rider.bikeFound = true;
    rider.x = 3;
    rider.z = 9;
    toggleBike(rider);
    toggleBike(rider);
    expect(rider.place.kind).toBe("foot");
    expect(rider.x).not.toBe(3);
  });

  it("stays found after the room loops", () => {
    const rider = createLobbyRider();
    rider.bikeFound = true;
    rider.x = 3;
    toggleBike(rider);
    respawnRider(rider);
    expect(rider.bikeFound).toBeTruthy();
    expect(rider.place.kind).toBe("foot");
  });
});

describe("near another rider", () => {
  it("seats the rider on a free stool and leaves them when they walk off", () => {
    const rider = createLobbyRider();
    const [stool] = STOOLS;
    if (!stool) {
      throw new Error("The bar has no stools.");
    }
    rider.x = stool.x;
    rider.z = stool.z + 0.9;
    const seat = stoolNear(rider, []);
    expect(seat).toBe(0);
    sitOnStool(rider, 0);
    expect(rider.place).toStrictEqual({ kind: "stool", stool: 0 });
    walk(rider, 0.2, { forward: 0, right: 0, sprint: false });
    expect(rider.x).toBe(stool.x);
    standUp(rider);
    expect(rider.place.kind).toBe("foot");
  });

  it("offers no stool someone is already on", () => {
    const rider = createLobbyRider();
    const [stool] = STOOLS;
    if (!stool) {
      throw new Error("The bar has no stools.");
    }
    rider.x = stool.x;
    rider.z = stool.z + 0.9;
    expect(stoolNear(rider, [{ x: stool.x, z: stool.z }])).toBeNull();
  });

  it("pushes a shoved rider away from the shover until the push fades", () => {
    const shoved = createLobbyRider();
    shoved.x = 3;
    shoved.z = 9;
    shoveRider(shoved, 2, 9);
    walk(shoved, 1);
    expect(shoved.x).toBeGreaterThan(3.2);
    expect(shoved.z).toBeCloseTo(9, 3);
    walk(shoved, 2);
    expect(shoved.pushX).toBe(0);
  });

  it("will not shove from a stool or mid-shove", () => {
    const rider = createLobbyRider();
    expect(startShove(rider)).toBeTruthy();
    expect(startShove(rider)).toBeFalsy();
    const seated = createLobbyRider();
    sitOnStool(seated, 0);
    expect(startShove(seated)).toBeFalsy();
  });

  it("toggles a held pose and drops it on the first step", () => {
    const rider = createLobbyRider();
    holdPose(rider, "phone");
    expect(rider.place).toStrictEqual({ kind: "foot", pose: "phone" });
    holdPose(rider, "phone");
    expect(rider.place).toStrictEqual({ kind: "foot", pose: null });
    holdPose(rider, "arms");
    walk(rider, 0.1, AHEAD);
    expect(rider.place).toStrictEqual({ kind: "foot", pose: null });
  });
});
