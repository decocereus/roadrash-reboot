import { describe, expect, it } from "vitest";

import { fightRow, riderTrack } from "../src/fight-report.ts";
import type { ProbeFrame, TakenFrames } from "../src/fight-report.ts";

const PRESS = 1000;
const SENT = PRESS + 15;
const FRAME_MS = 16;
const ATTACKER = 0;
const VICTIM = 1;
const KICK_TICKS = 15;
const CONTACT = 4;
const SHOWN = SENT + 300;
const TICK_AT_SHOWN = 200;

const STRUCK_TICK = 124;

const rider = (stamina: number, lastHitBy: number | null) => ({
  attack: "none",
  attackTicks: 0,
  hitStun: 0,
  lastHitBy,
  lastHitTick: lastHitBy === null ? -1 : STRUCK_TICK,
  mode: "riding",
  s: 0,
  speed: 40,
  stamina,
  x: 0,
});

interface Drawn {
  readonly at: number;
  readonly tick: number;
  readonly pose: string;
  readonly reach: number;
  readonly hit: boolean;
  readonly flinch: number;
  readonly shoved: boolean;
}

const frameOf = ({
  at,
  flinch,
  hit,
  pose,
  reach,
  shoved,
  tick,
}: Drawn): ProbeFrame => ({
  at,
  confirmed: [rider(100, null), rider(hit ? 50 : 100, null)],
  drawn: [
    { flinch: 0, pose, reach, x: 1.3 },
    { flinch, pose: "seated", reach: 0, x: 0 },
  ],
  heard: tick - 17,
  predicted: [rider(100, null), rider(100, shoved ? ATTACKER : null)],
  rtt: 114,
  tick,
});

const nothing: TakenFrames = {
  attacks: [],
  falls: [],
  frames: [],
  lostButtons: [],
  placed: [],
  presses: [],
  sends: [],
};

const attacker: TakenFrames = {
  ...nothing,
  attacks: [{ at: SENT + 290, attack: "kick", rider: ATTACKER, tick: 120 }],
  frames: [
    frameOf({
      at: PRESS,
      flinch: 0,
      hit: false,
      pose: "seated",
      reach: 0,
      shoved: false,
      tick: 117,
    }),
  ],
  sends: [{ at: SENT, through: 118 }],
};

const victimSaw = (shoveFrom: number, flinchFrom: number): TakenFrames => {
  const frames = [
    frameOf({
      at: PRESS,
      flinch: 0,
      hit: false,
      pose: "seated",
      reach: 0,
      shoved: false,
      tick: 100,
    }),
  ];
  for (let elapsed = 0; elapsed < KICK_TICKS; elapsed += 1) {
    frames.push(
      frameOf({
        at: SHOWN + elapsed * FRAME_MS,
        flinch: elapsed >= flinchFrom ? 10 : 0,
        hit: elapsed >= CONTACT,
        pose: "kick",
        reach: Math.min(1, elapsed / CONTACT),
        shoved: elapsed >= shoveFrom,
        tick: TICK_AT_SHOWN + elapsed,
      })
    );
  }
  return {
    ...nothing,
    attacks: [{ at: SENT + 297, attack: "kick", rider: ATTACKER, tick: 120 }],
    frames,
    placed: [
      {
        at: SHOWN,
        riding: [true, true],
        tick: TICK_AT_SHOWN + CONTACT,
        x: [1, 0],
      },
    ],
  };
};

describe("reading a fight from both windows", () => {
  it("splits the delay from press to the victim's screen into its stages", () => {
    const row = fightRow(
      "kick",
      ATTACKER,
      VICTIM,
      PRESS,
      attacker,
      victimSaw(CONTACT, CONTACT)
    );
    expect({
      hold: row.holdMs,
      lead: row.lead,
      pressToSend: row.pressToSendMs,
      pressToStrikeOut: row.pressToStrikeOutMs,
      sendToVictim: row.sendToVictimMs,
      victimConfirmToDrawn: row.victimConfirmToDrawnMs,
    }).toStrictEqual({
      hold: 290 - 114,
      lead: 17,
      pressToSend: 15,
      pressToStrikeOut: SHOWN + CONTACT * FRAME_MS - PRESS,
      sendToVictim: 297,
      victimConfirmToDrawn: 3,
    });
  });

  it("passes a kick that is out on the frame the shove and the flinch show", () => {
    const row = fightRow(
      "kick",
      ATTACKER,
      VICTIM,
      PRESS,
      attacker,
      victimSaw(CONTACT, CONTACT)
    );
    expect(row.passed).toBeTruthy();
    expect(row.strikeOutBeforeShoveMs).toBe(0);
    expect(row.strikeOutBeforeFlinchMs).toBe(0);
    expect(row.drawnErrorAtHitMetres).toBeCloseTo(0.3);
  });

  it("fails a kick whose shove showed before the leg was out", () => {
    const row = fightRow(
      "kick",
      ATTACKER,
      VICTIM,
      PRESS,
      attacker,
      victimSaw(0, CONTACT)
    );
    expect(row.passed).toBeFalsy();
    expect(row.strikeOutBeforeShoveMs).toBe(-CONTACT * FRAME_MS);
  });

  it("fails a kick whose flinch showed before the leg was out", () => {
    const row = fightRow(
      "kick",
      ATTACKER,
      VICTIM,
      PRESS,
      attacker,
      victimSaw(CONTACT, 1)
    );
    expect(row.passed).toBeFalsy();
  });

  it("fails a landed hit with no flinch", () => {
    const row = fightRow(
      "kick",
      ATTACKER,
      VICTIM,
      PRESS,
      attacker,
      victimSaw(CONTACT, KICK_TICKS)
    );
    expect(row.passed).toBeFalsy();
  });

  it("passes a kick that knocks the victim off, with no flinch to draw", () => {
    const knocked = victimSaw(CONTACT, KICK_TICKS);
    const frames = knocked.frames.map((frame, index) =>
      index > CONTACT
        ? {
            ...frame,
            predicted: frame.predicted.map((one, who) =>
              who === VICTIM ? { ...one, mode: "thrown" } : one
            ),
          }
        : frame
    );
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, attacker, {
      ...knocked,
      frames,
    });
    expect(row.passed).toBeTruthy();
  });

  it("fails a guessed shove that showed early even when the room called it a miss", () => {
    const missed = victimSaw(0, KICK_TICKS);
    const frames = missed.frames.map((frame) => ({
      ...frame,
      confirmed: [rider(100, null), rider(100, null)],
    }));
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, attacker, {
      ...missed,
      frames,
    });
    expect(row.hitLanded).toBeFalsy();
    expect(row.passed).toBeFalsy();
  });

  it("ignores another rider's earlier contact with the victim", () => {
    const kicked = victimSaw(CONTACT, CONTACT);
    const OTHER = 2;
    const frames = kicked.frames.map((frame, index) =>
      index > 0 && index <= CONTACT
        ? {
            ...frame,
            predicted: [
              rider(100, null),
              { ...rider(100, null), lastHitBy: OTHER, lastHitTick: 121 },
            ],
          }
        : frame
    );
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, attacker, {
      ...kicked,
      frames,
    });
    expect(row.strikeOutBeforeShoveMs).toBe(0);
    expect(row.passed).toBeTruthy();
  });

  it("fails a kick the victim never saw", () => {
    const row = fightRow("kick", ATTACKER, VICTIM, PRESS, attacker, nothing);
    expect(row.passed).toBeFalsy();
    expect(row.pressToShownMs).toBeNull();
  });
});

describe("how far another rider is drawn from the room's position", () => {
  const GUESSES = [0, 0.25, 1, 1.25];
  const DRIFT = [0, 0.125, 0.5, 0.125];
  const frames = GUESSES.map((x, index) => {
    const base = frameOf({
      at: index * FRAME_MS,
      flinch: 0,
      hit: false,
      pose: "seated",
      reach: 0,
      shoved: false,
      tick: index,
    });
    const settling = x - (DRIFT[index] ?? 0);
    return {
      ...base,
      drawn: [
        { flinch: 0, pose: "seated", reach: 0, x: settling },
        { flinch: 0, pose: "seated", reach: 0, x: 0 },
      ],
      predicted: [{ ...rider(100, null), x }, rider(100, null)],
    };
  });
  const taken: TakenFrames = {
    ...nothing,
    frames,
    placed: GUESSES.map((x, tick) => ({
      at: tick,
      riding: [true, true],
      tick,
      x: [x, 0],
    })),
  };

  it("measures the guess and the drawn rider against the same race", () => {
    expect(riderTrack(taken, ATTACKER)).toStrictEqual({
      drawn: { errorP95Metres: 0.5, frames: 4, worstStepMetres: 0.625 },
      guessed: { errorP95Metres: 0, frames: 4, worstStepMetres: 0.75 },
      rider: ATTACKER,
    });
  });

  it("skips the frames where the room has the rider down", () => {
    const down = taken.placed.map((one) =>
      one.tick === 2 ? { ...one, riding: [false, true] } : one
    );
    expect(riderTrack({ ...taken, placed: down }, ATTACKER)).toStrictEqual({
      drawn: { errorP95Metres: 0.125, frames: 3, worstStepMetres: 0.125 },
      guessed: { errorP95Metres: 0, frames: 3, worstStepMetres: 0.25 },
      rider: ATTACKER,
    });
  });
});
