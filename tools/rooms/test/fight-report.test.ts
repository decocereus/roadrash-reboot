import { describe, expect, it } from "vitest";

import { fightRow, worstPop } from "../src/fight-report.ts";
import type { ProbeFrame } from "../src/fight-report.ts";

const PRESS = 1000;
const FRAME_MS = 16;
const ATTACKER = 0;
const VICTIM = 1;

const rider = (stamina: number) => ({
  attack: "none",
  attackTicks: 0,
  hitStun: 0,
  mode: "riding",
  s: 0,
  speed: 40,
  stamina,
  x: 0,
});

const KICK_TICKS = 15;
const LAND = 4;

const frameAt = (
  at: number,
  pose: string,
  reach: number,
  stamina: number,
  flinch: number,
  x = 0
): ProbeFrame => ({
  at,
  confirmed: [rider(100), rider(stamina)],
  drawn: [
    { flinch: 0, pose, reach, x },
    { flinch, pose: "seated", reach: 0, x: 0 },
  ],
  heard: 100,
  predicted: [rider(100), rider(stamina)],
  rtt: 120,
  tick: 113,
});

const kickFrames = (flinchFrom: number): ProbeFrame[] => {
  const frames = [frameAt(PRESS, "seated", 0, 100, 0)];
  for (let elapsed = 0; elapsed < KICK_TICKS; elapsed += 1) {
    frames.push(
      frameAt(
        PRESS + 200 + elapsed * FRAME_MS,
        "kick",
        Math.min(1, elapsed / LAND),
        elapsed >= LAND ? 50 : 100,
        elapsed >= flinchFrom ? 10 : 0
      )
    );
  }
  return frames;
};

describe("reading a fight from the victim's window", () => {
  it("passes a kick whose leg is out when the hit shows, with the delays", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, kickFrames(LAND));
    expect(row.passed).toBeTruthy();
    expect(row.pressToShownMs).toBe(200);
    expect(row.pressToLandMs).toBe(200 + LAND * FRAME_MS);
    expect(row.legOutBeforeHitMs).toBe(0);
    expect(row.staminaLost).toBe(50);
  });

  it("fails a kick whose hit showed before the leg was out", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, kickFrames(1));
    expect(row.passed).toBeFalsy();
    expect(row.legOutBeforeHitMs).toBe(-(LAND - 1) * FRAME_MS);
  });

  it("fails a kick the victim never saw", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, [
      frameAt(PRESS, "seated", 0, 100, 0),
    ]);
    expect(row.passed).toBeFalsy();
    expect(row.pressToShownMs).toBeNull();
  });

  it("fails a landed hit with no flinch", () => {
    const frames = kickFrames(KICK_TICKS);
    expect(
      fightRow("kick", ATTACKER, VICTIM, PRESS, frames).passed
    ).toBeFalsy();
  });
});

describe("how far a rider pops in one frame", () => {
  it("reads the biggest step between frames", () => {
    const frames = [0, 0.03, 0.5, 0.53].map((x, index) =>
      frameAt(index, "seated", 0, 100, 0, x)
    );
    expect(worstPop(frames, ATTACKER)).toBeCloseTo(0.47);
  });
});
