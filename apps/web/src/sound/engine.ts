import type { EngineCharacter } from "./characters.ts";
import { gainGlide, pitchGlide } from "./glide.ts";

const SHIFT_SECONDS = 0.12;

export interface EngineVoice {
  readonly drive: (
    on: boolean,
    revs: number,
    throttle: number,
    now: number
  ) => void;
  readonly dip: (now: number) => void;
  readonly stop: () => void;
}

interface Oscillator {
  readonly node: OscillatorNode;
  readonly gain: GainNode;
}

const oscillator = (
  context: BaseAudioContext,
  type: OscillatorType,
  level: number
): Oscillator => {
  const node = context.createOscillator();
  node.type = type;
  const gain = context.createGain();
  gain.gain.value = level;
  node.connect(gain);
  node.start();
  return { gain, node };
};

const voiceOf = (
  context: BaseAudioContext,
  type: OscillatorType,
  level: number,
  out: AudioNode
): OscillatorNode => {
  const { gain, node } = oscillator(context, type, level);
  gain.connect(out);
  return node;
};

export const engineVoice = (
  context: BaseAudioContext,
  character: EngineCharacter,
  out: AudioNode
): EngineVoice => {
  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = character.tone;
  const level = context.createGain();
  level.gain.value = 0;
  const shift = context.createGain();
  shift.gain.value = 1;
  tone.connect(level).connect(shift).connect(out);
  const saw = voiceOf(context, "sawtooth", character.saw, tone);
  const square = voiceOf(context, "square", character.square, tone);
  const growl = voiceOf(context, "square", character.growl, tone);
  const fifth = voiceOf(context, "sawtooth", character.fifth * 0.6, tone);
  fifth.detune.value = -9;
  const lope = oscillator(context, "sine", character.lope * 0.05);
  lope.node.frequency.value = 7.5;
  lope.gain.connect(level.gain);
  const glides = {
    fifth: pitchGlide(fifth.frequency, character.glide),
    growl: pitchGlide(growl.frequency, character.glide),
    level: gainGlide(level.gain, 0.06),
    saw: pitchGlide(saw.frequency, character.glide),
    square: pitchGlide(square.frequency, character.glide),
    tone: pitchGlide(tone.frequency, 0.08),
  };
  return {
    dip(now) {
      shift.gain.cancelScheduledValues(now);
      shift.gain.setValueAtTime(0.25, now);
      shift.gain.linearRampToValueAtTime(1, now + SHIFT_SECONDS);
    },
    drive(on, revs, throttle, now) {
      const hertz =
        character.idle + (character.redline - character.idle) * revs ** 1.1;
      glides.saw(hertz, now);
      glides.square(hertz, now);
      glides.growl(hertz / 2, now);
      glides.fifth((hertz * 2) / 3, now);
      glides.level(on ? 0.06 + throttle * 0.1 + revs * 0.03 : 0, now);
      glides.tone(character.tone + throttle * 1500 + revs * 1200, now);
    },
    stop() {
      for (const node of [saw, square, growl, fifth, lope.node]) {
        node.stop();
      }
      shift.disconnect();
    },
  };
};
