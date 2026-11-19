import type { Cue, Loop } from "./cues.ts";

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

export interface LoopRecipe {
  readonly layers: Layers;
  readonly seconds: number;
  readonly fade: number;
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
    2,
    0.05
  ),
  hit: recipe("strike", [
    burst(260, 0.16, 0.9, 70),
    burst(1200, 0.08, 0.35, 300),
    tone("sine", 95, 50, { decay: 0.12, gain: 0.35 }),
  ]),
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
  siren: recipe(
    "big",
    [sirenNote(0), sirenNote(1), sirenNote(2), sirenNote(3)],
    1,
    0
  ),
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
  weaponHit: recipe("strike", [
    burst(120, 0.34, 1.2, 40),
    burst(520, 0.14, 0.6, 140),
    burst(2600, 0.06, 0.3, 900),
  ]),
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

const BEAT = 60 / 92;
const BEATS = 12;
const BED_SECONDS = BEAT * BEATS;
const whole = (gain: number): EnvelopeAt => ({
  attack: 0.001,
  decay: 0.001,
  gain,
  hold: BED_SECONDS + 0.5,
});

export const loopRecipes = {
  roomBed: {
    fade: 0.4,
    layers: [
      { ...enveloped(whole(0.55)), cutoff: 2600, kind: "murmur", voices: 14 },
      crackle(6, 3000, whole(0.12)),
      crackle(900, 1800, whole(0.02)),
      ...Array.from({ length: BEATS }, (_, beat) =>
        tone("sine", 62, 45, { at: beat * BEAT, decay: 0.15, gain: 0.1 }, 400)
      ),
      ...Array.from({ length: BEATS / 2 }, (_, bar) =>
        tone(
          "triangle",
          bar % 2 === 0 ? 55 : 73.4,
          bar % 2 === 0 ? 55 : 73.4,
          {
            at: bar * BEAT * 2,
            attack: 0.02,
            decay: 0.3,
            gain: 0.09,
            hold: BEAT * 1.4,
          },
          260
        )
      ),
    ],
    seconds: BED_SECONDS,
  },
} as const satisfies Record<Loop, LoopRecipe>;

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
