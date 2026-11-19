import type { EngineCharacter } from "./characters.ts";
import { engineControl } from "./engine-control.ts";
import type { EngineControl } from "./engine-control.ts";

const LOPE_DEPTH = 0.6;

export interface EngineVoice extends EngineControl {
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
  const pulse = context.createGain();
  pulse.gain.value = 1;
  const shift = context.createGain();
  shift.gain.value = 1;
  tone.connect(level).connect(pulse).connect(shift).connect(out);
  const saw = voiceOf(context, "sawtooth", character.saw, tone);
  const square = voiceOf(context, "square", character.square, tone);
  const growl = voiceOf(context, "square", character.growl, tone);
  const fifth = voiceOf(context, "sawtooth", character.fifth * 0.6, tone);
  fifth.detune.value = -9;
  const lope = oscillator(context, "sine", character.lope * LOPE_DEPTH);
  lope.node.frequency.value = 7.5;
  lope.gain.connect(pulse.gain);
  return {
    ...engineControl(character, {
      fifth: fifth.frequency,
      growl: growl.frequency,
      level: level.gain,
      saw: saw.frequency,
      shift: shift.gain,
      square: square.frequency,
      tone: tone.frequency,
    }),
    stop() {
      for (const node of [saw, square, growl, fifth, lope.node]) {
        node.stop();
      }
      shift.disconnect();
    },
  };
};
