import type { Cue } from "./cues.ts";

type Wave = "sine" | "square" | "sawtooth" | "triangle";
type Band = "lowpass" | "bandpass" | "highpass";

export interface Envelope {
  readonly at: number;
  readonly attack: number;
  readonly hold: number;
  readonly decay: number;
  readonly gain: number;
}

export type Layer =
  | (Envelope & {
      readonly kind: "tone";
      readonly wave: Wave;
      readonly from: number;
      readonly to: number;
      readonly cutoff: number;
    })
  | (Envelope & {
      readonly kind: "noise";
      readonly band: Band;
      readonly from: number;
      readonly to: number;
      readonly q: number;
    })
  | (Envelope & {
      readonly kind: "crackle";
      readonly perSecond: number;
      readonly cutoff: number;
    })
  | (Envelope & {
      readonly kind: "murmur";
      readonly voices: number;
      readonly cutoff: number;
    });

export type Layers = readonly [Layer, ...Layer[]];

export const priorities = ["interface", "step", "strike", "big"] as const;

type Priority = (typeof priorities)[number];

export interface Recipe {
  readonly layers: Layers;
  readonly variants: number;
  readonly spread: number;
  readonly priority: Priority;
}

type EnvelopeAt = Partial<Envelope> & Pick<Envelope, "decay" | "gain">;

const enveloped = (span: EnvelopeAt): Envelope => ({
  at: span.at ?? 0,
  attack: span.attack ?? 0.002,
  decay: span.decay,
  gain: span.gain,
  hold: span.hold ?? 0,
});

const tone = (
  wave: Wave,
  from: number,
  to: number,
  span: EnvelopeAt,
  cutoff = 20_000
): Layer => ({ ...enveloped(span), cutoff, from, kind: "tone", to, wave });

const noise = (
  band: Band,
  from: number,
  to: number,
  span: EnvelopeAt,
  q = 0.9
): Layer => ({ ...enveloped(span), band, from, kind: "noise", q, to });

const crackle = (
  perSecond: number,
  cutoff: number,
  span: EnvelopeAt
): Layer => ({
  ...enveloped(span),
  cutoff,
  kind: "crackle",
  perSecond,
});

const burst = (
  hertz: number,
  seconds: number,
  gain: number,
  sweepTo: number,
  at = 0
): Layer => noise("bandpass", hertz, sweepTo, { at, decay: seconds, gain });

const recipe = (
  priority: Priority,
  layers: Layers,
  variants = 3,
  spread = 0.06
): Recipe => ({ layers, priority, spread, variants });

const SIREN_STEP = 0.28;
const sirenNote = (step: number): Layer =>
  tone(
    "square",
    step % 2 === 0 ? 660 : 880,
    step % 2 === 0 ? 660 : 880,
    {
      at: step * SIREN_STEP,
      attack: 0.02,
      decay: 0.04,
      gain: 0.16,
      hold: SIREN_STEP - 0.05,
    },
    2200
  );

const stamp: Layers = [
  noise("bandpass", 1300, 600, { decay: 0.06, gain: 0.6 }, 0.8),
  tone("sine", 440, 280, { decay: 0.07, gain: 0.28 }),
  noise("bandpass", 3200, 2600, { decay: 0.02, gain: 0.25 }, 1.5),
];

export const recipes = {
  back: recipe("interface", [
    tone("sine", 330, 200, { decay: 0.09, gain: 0.3 }),
    noise("bandpass", 800, 400, { decay: 0.06, gain: 0.55 }, 0.8),
  ]),
  batonHit: recipe("strike", [
    burst(110, 0.32, 1.3, 40),
    tone("sine", 140, 70, { decay: 0.15, gain: 0.4 }),
    burst(700, 0.06, 0.3, 300),
  ]),
  buy: recipe(
    "interface",
    [
      noise("bandpass", 1200, 600, { attack: 0.03, decay: 0.1, gain: 0.35 }, 1),
      tone("sine", 120, 90, { at: 0.11, decay: 0.08, gain: 0.35 }),
      tone("sine", 2093, 2093, { at: 0.12, decay: 0.6, gain: 0.12 }),
      tone("sine", 2637, 2637, { at: 0.12, decay: 0.45, gain: 0.08 }),
      tone("sine", 3136, 3136, { at: 0.17, decay: 0.4, gain: 0.07 }),
    ],
    1,
    0
  ),
  chainHit: recipe("strike", [
    burst(120, 0.3, 1, 45),
    crackle(900, 7000, { decay: 0.25, gain: 0.4 }),
    tone("sine", 2400, 2380, { decay: 0.2, gain: 0.03 }),
    tone("sine", 3150, 3120, { at: 0.03, decay: 0.15, gain: 0.025 }),
  ]),
  clubHit: recipe("strike", [
    burst(160, 0.3, 1.1, 50),
    tone("sine", 420, 380, { decay: 0.08, gain: 0.3 }),
    burst(1800, 0.03, 0.4, 1200),
  ]),
  count: recipe(
    "strike",
    [
      tone("sine", 880, 880, { decay: 0.08, gain: 0.22, hold: 0.12 }),
      tone("square", 880, 880, { decay: 0.06, gain: 0.03, hold: 0.12 }, 3000),
    ],
    1,
    0
  ),
  crash: recipe(
    "big",
    [
      noise("lowpass", 500, 45, { attack: 0.003, decay: 0.7, gain: 1.4 }, 0.7),
      tone("sine", 75, 35, { decay: 0.4, gain: 0.35 }),
      noise("bandpass", 1800, 500, { decay: 0.3, gain: 0.9 }, 1.3),
      tone("sine", 523, 515, { decay: 0.9, gain: 0.04 }),
      tone("sine", 1187, 1170, { decay: 0.7, gain: 0.035 }),
      tone("sine", 1873, 1850, { at: 0.02, decay: 0.5, gain: 0.03 }),
      tone("sine", 2731, 2700, { at: 0.02, decay: 0.35, gain: 0.025 }),
      crackle(80, 5000, { at: 0.02, attack: 0.01, decay: 0.5, gain: 0.35 }),
      noise(
        "bandpass",
        2400,
        1500,
        { at: 0.25, attack: 0.08, decay: 0.9, gain: 0.5, hold: 0.5 },
        0.8
      ),
      crackle(400, 7000, {
        at: 0.25,
        attack: 0.08,
        decay: 0.8,
        gain: 0.16,
        hold: 0.5,
      }),
    ],
    1,
    0.05
  ),
  crowbarHit: recipe("strike", [
    burst(140, 0.3, 1.1, 50),
    tone("sine", 1250, 1240, { decay: 0.5, gain: 0.05 }),
    tone("sine", 2810, 2790, { decay: 0.4, gain: 0.035 }),
    tone("sine", 4400, 4380, { decay: 0.25, gain: 0.02 }),
    burst(3000, 0.03, 0.4, 2000),
  ]),
  cueHit: recipe("strike", [
    burst(2500, 0.04, 0.6, 1500),
    tone("sine", 900, 700, { decay: 0.05, gain: 0.2 }),
    burst(200, 0.2, 0.9, 60),
  ]),
  door: recipe(
    "big",
    [
      burst(180, 0.18, 1, 70),
      tone("sine", 70, 45, { decay: 0.12, gain: 0.3 }),
      tone(
        "sawtooth",
        48,
        58,
        { at: 0.1, attack: 0.3, decay: 0.4, gain: 0.13, hold: 1.8 },
        320
      ),
      crackle(140, 2600, {
        at: 0.1,
        attack: 0.25,
        decay: 0.4,
        gain: 0.45,
        hold: 1.8,
      }),
      noise(
        "bandpass",
        1700,
        2300,
        { at: 0.1, attack: 0.3, decay: 0.4, gain: 0.14, hold: 1.8 },
        3
      ),
      burst(240, 0.22, 0.9, 80, 2.55),
      tone("sine", 690, 680, { at: 2.55, decay: 0.5, gain: 0.05 }),
      tone("sine", 1530, 1510, { at: 2.55, decay: 0.35, gain: 0.03 }),
    ],
    1,
    0
  ),
  finish: recipe(
    "big",
    [
      burst(180, 0.3, 0.9, 60),
      tone(
        "square",
        523,
        523,
        { attack: 0.02, decay: 0.6, gain: 0.06, hold: 0.5 },
        2500
      ),
      tone(
        "square",
        659,
        659,
        { attack: 0.02, decay: 0.6, gain: 0.05, hold: 0.5 },
        2500
      ),
      tone(
        "square",
        784,
        784,
        { attack: 0.02, decay: 0.6, gain: 0.05, hold: 0.5 },
        2500
      ),
      {
        ...enveloped({
          at: 0.1,
          attack: 0.3,
          decay: 0.9,
          gain: 0.7,
          hold: 0.6,
        }),
        cutoff: 3200,
        kind: "murmur",
        voices: 10,
      },
    ],
    1,
    0
  ),
  gained: recipe(
    "strike",
    [
      tone("triangle", 660, 660, { decay: 0.1, gain: 0.16 }),
      tone("triangle", 990, 990, { at: 0.09, decay: 0.22, gain: 0.16 }),
    ],
    1,
    0
  ),
  go: recipe(
    "strike",
    [
      tone("sine", 1320, 1320, { decay: 0.3, gain: 0.26, hold: 0.35 }),
      tone("sine", 1760, 1760, { decay: 0.25, gain: 0.08, hold: 0.3 }),
      tone("square", 1320, 1320, { decay: 0.2, gain: 0.03, hold: 0.35 }, 3500),
    ],
    1,
    0
  ),
  greet: recipe("strike", [
    burst(2300, 0.045, 0.7, 1300),
    noise("highpass", 4200, 4200, { decay: 0.015, gain: 0.25 }, 0.7),
    tone("sine", 190, 120, { decay: 0.05, gain: 0.2 }),
    burst(1600, 0.05, 0.5, 900, 0.1),
    tone("sine", 160, 110, { at: 0.1, decay: 0.05, gain: 0.15 }),
  ]),
  hit: recipe("strike", [
    burst(260, 0.16, 0.9, 70),
    burst(1200, 0.08, 0.35, 300),
    tone("sine", 95, 50, { decay: 0.12, gain: 0.35 }),
  ]),
  land: recipe("strike", [
    burst(120, 0.25, 1.2, 50),
    tone("sine", 80, 45, { decay: 0.15, gain: 0.35 }),
    tone("sine", 260, 240, { at: 0.02, decay: 0.2, gain: 0.05 }),
    noise("bandpass", 2200, 1800, { at: 0.01, decay: 0.05, gain: 0.25 }, 2),
  ]),
  lost: recipe(
    "strike",
    [
      tone("triangle", 600, 600, { decay: 0.1, gain: 0.16 }),
      tone("triangle", 400, 400, { at: 0.09, decay: 0.22, gain: 0.16 }),
    ],
    1,
    0
  ),
  menuClose: recipe("interface", [
    noise("bandpass", 600, 2000, { attack: 0.02, decay: 0.1, gain: 0.3 }, 1),
    tone("sine", 200, 300, { at: 0.04, decay: 0.06, gain: 0.22 }),
  ]),
  menuOpen: recipe("interface", [
    noise("bandpass", 2200, 600, { attack: 0.03, decay: 0.12, gain: 0.32 }, 1),
    tone("sine", 300, 180, { at: 0.05, decay: 0.08, gain: 0.25 }),
  ]),
  move: recipe(
    "interface",
    [
      tone("sine", 1400, 900, { decay: 0.035, gain: 0.12 }),
      noise("bandpass", 3000, 2600, { decay: 0.02, gain: 0.1 }, 2),
    ],
    4,
    0.08
  ),
  pose: recipe("step", [
    noise(
      "bandpass",
      2600,
      1400,
      { attack: 0.02, decay: 0.12, gain: 0.4 },
      0.7
    ),
    crackle(220, 4500, { attack: 0.02, decay: 0.12, gain: 0.12 }),
    noise("lowpass", 300, 100, { at: 0.1, decay: 0.06, gain: 0.7 }, 0.7),
  ]),
  press: recipe("interface", stamp),
  refused: recipe(
    "interface",
    [
      tone("sine", 240, 200, { decay: 0.07, gain: 0.35 }),
      noise("bandpass", 700, 400, { decay: 0.05, gain: 0.45 }, 0.8),
      tone("sine", 220, 180, { at: 0.11, decay: 0.08, gain: 0.35 }),
      noise("bandpass", 650, 380, { at: 0.11, decay: 0.05, gain: 0.45 }, 0.8),
      tone("square", 110, 105, { decay: 0.18, gain: 0.07 }, 700),
    ],
    1,
    0
  ),
  runStep: recipe(
    "step",
    [
      noise("lowpass", 420, 120, { decay: 0.055, gain: 1.1 }, 0.7),
      tone("sine", 115, 65, { decay: 0.04, gain: 0.3 }),
      noise("bandpass", 3200, 2400, { at: 0.005, decay: 0.03, gain: 0.3 }, 1),
      crackle(300, 6000, { decay: 0.03, gain: 0.08 }),
    ],
    6,
    0.12
  ),
  shift: recipe("strike", [burst(1600, 0.05, 0.3, 700)], 2),
  shove: recipe("strike", [
    noise("bandpass", 900, 380, { attack: 0.03, decay: 0.12, gain: 0.55 }, 0.8),
    noise("lowpass", 320, 90, { at: 0.06, decay: 0.12, gain: 1 }, 0.7),
    tone("sine", 95, 55, { at: 0.06, decay: 0.1, gain: 0.3 }),
    crackle(260, 3500, { at: 0.06, decay: 0.1, gain: 0.12 }),
  ]),
  signHit: recipe("strike", [
    burst(150, 0.3, 1, 50),
    tone("sine", 380, 360, { decay: 0.5, gain: 0.07 }),
    tone("sine", 1100, 1040, { decay: 0.35, gain: 0.05 }),
    crackle(150, 4000, { decay: 0.3, gain: 0.15 }),
  ]),
  siren: recipe(
    "big",
    [sirenNote(0), sirenNote(1), sirenNote(2), sirenNote(3)],
    1,
    0
  ),
  sit: recipe("step", [
    tone(
      "sawtooth",
      190,
      150,
      { attack: 0.02, decay: 0.16, gain: 0.12, hold: 0.04 },
      900
    ),
    tone("sine", 880, 1040, { at: 0.03, decay: 0.08, gain: 0.03 }),
    noise("lowpass", 220, 80, { at: 0.05, decay: 0.1, gain: 0.85 }, 0.7),
    tone("sine", 85, 55, { at: 0.05, decay: 0.08, gain: 0.25 }),
  ]),
  swing: recipe("strike", [burst(1800, 0.12, 0.45, 500)]),
  tab: recipe("interface", [
    tone("sine", 1100, 800, { decay: 0.03, gain: 0.13 }),
    tone("sine", 1500, 1100, { at: 0.045, decay: 0.03, gain: 0.11 }),
    noise("bandpass", 3500, 3000, { decay: 0.02, gain: 0.08 }, 2),
  ]),
  thump: recipe("strike", [burst(140, 0.22, 1.2, 60)]),
  walkStep: recipe(
    "step",
    [
      noise("lowpass", 260, 90, { decay: 0.07, gain: 0.95 }, 0.7),
      tone("sine", 95, 60, { decay: 0.05, gain: 0.25 }),
      noise(
        "bandpass",
        2600,
        1800,
        { at: 0.01, attack: 0.006, decay: 0.045, gain: 0.3 },
        1.2
      ),
      noise("highpass", 4000, 4000, { decay: 0.012, gain: 0.15 }, 0.7),
    ],
    6,
    0.12
  ),
  welcome: recipe(
    "interface",
    [
      ...stamp,
      tone("triangle", 660, 660, { at: 0.08, decay: 0.25, gain: 0.1 }),
      tone("triangle", 990, 990, { at: 0.16, decay: 0.35, gain: 0.1 }),
    ],
    1,
    0
  ),
  whoosh: recipe("strike", [burst(1400, 0.35, 0.7, 260)]),
} as const satisfies Record<Cue, Recipe>;

export const recipeSeconds = (layers: Layers): number => {
  let longest = 0;
  for (const layer of layers) {
    longest = Math.max(
      longest,
      layer.at + layer.attack + layer.hold + layer.decay + 0.02
    );
  }
  return longest;
};
