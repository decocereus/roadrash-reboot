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

const frameAt = (
  at: number,
  attack: string,
  elapsed: number,
  stamina: number,
  flinch: number,
  x = 0
): ProbeFrame => ({
  at,
  confirmed: [rider(100), rider(stamina)],
  drawn: [
    { attack, elapsed, flinch: 0, x },
    { attack: "none", elapsed: 0, flinch, x: 0 },
  ],
  heard: 100,
  predicted: [rider(100), rider(stamina)],
  rtt: 120,
  tick: 113,
});

const kickFrames = (firstElapsed: number): ProbeFrame[] => {
  const frames = [frameAt(PRESS, "none", 0, 100, 0)];
  for (let elapsed = firstElapsed; elapsed < 15; elapsed += 1) {
    const landed = elapsed >= 4;
    frames.push(
      frameAt(
        PRESS + 200 + elapsed * FRAME_MS,
        "kick",
        elapsed,
        landed ? 50 : 100,
        landed ? 10 : 0
      )
    );
  }
  return frames;
};

describe("reading a fight from the victim's window", () => {
  it("passes a kick drawn from its first frames, with the delay to the victim", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, kickFrames(0));
    expect(row.passed).toBeTruthy();
    expect(row.pressToShownMs).toBe(200);
    expect(row.shownBeforeLandMs).toBe(4 * FRAME_MS);
    expect(row.staminaLost).toBe(50);
  });

  it("fails a kick the victim only saw the end of", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, kickFrames(13));
    expect(row.passed).toBeFalsy();
  });

  it("fails a kick the victim never saw", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, [
      frameAt(PRESS, "none", 0, 100, 0),
    ]);
    expect(row.passed).toBeFalsy();
    expect(row.pressToShownMs).toBeNull();
  });

  it("fails a landed hit with no flinch", () => {
    const frames = kickFrames(0).map((frame) => ({
      ...frame,
      drawn: frame.drawn.map((drawn) => ({ ...drawn, flinch: 0 })),
    }));
    expect(
      fightRow("kick", ATTACKER, VICTIM, PRESS, frames).passed
    ).toBeFalsy();
  });
});

describe("how far a rider pops in one frame", () => {
  it("reads the biggest step between frames", () => {
    const frames = [0, 0.03, 0.5, 0.53].map((x, index) =>
      frameAt(index, "none", 0, 100, 0, x)
    );
    expect(worstPop(frames, ATTACKER)).toBeCloseTo(0.47);
  });
});
