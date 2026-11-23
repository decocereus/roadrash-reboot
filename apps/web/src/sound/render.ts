import type { Layer, Layers, Recipe, Envelope } from "./recipes.ts";
import { recipeSeconds } from "./recipes.ts";

const MODULUS = 2_147_483_647;
const MULTIPLIER = 16_807;
const NOISE_SECONDS = 2;
const SILENT = 0.0001;
const OPEN = 20_000;

export type Random = () => number;

export const seeded = (seed: number): Random => {
  let state = (Math.abs(Math.trunc(seed)) % (MODULUS - 1)) + 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
};

export const noiseBuffer = (context: BaseAudioContext): AudioBuffer =>
  context.createBuffer(
    1,
    context.sampleRate * NOISE_SECONDS,
    context.sampleRate
  );

export const fillNoise = (
  buffer: AudioBuffer,
  random: Random,
  from: number,
  to: number
): void => {
  const samples = buffer.getChannelData(0);
  const end = Math.min(to, samples.length);
  for (let index = from; index < end; index += 1) {
    samples[index] = random() * 2 - 1;
  }
};

export const whiteNoise = (
  context: BaseAudioContext,
  random: Random
): AudioBuffer => {
  const buffer = noiseBuffer(context);
  fillNoise(buffer, random, 0, buffer.length);
  return buffer;
};

const endOf = (span: Envelope, start: number): number =>
  start + span.at + span.attack + span.hold + span.decay;

const envelope = (param: AudioParam, span: Envelope, start: number): void => {
  const begin = start + span.at;
  const peak = begin + span.attack;
  param.setValueAtTime(0, begin);
  param.linearRampToValueAtTime(span.gain, peak);
  param.setValueAtTime(span.gain, peak + span.hold);
  param.exponentialRampToValueAtTime(SILENT, endOf(span, start));
};

const sweep = (
  param: AudioParam,
  from: number,
  to: number,
  begin: number,
  end: number
): void => {
  param.setValueAtTime(from, begin);
  if (to !== from) {
    param.exponentialRampToValueAtTime(to, end);
  }
};

const enveloped = (
  context: BaseAudioContext,
  span: Envelope,
  start: number,
  out: AudioNode
): GainNode => {
  const gain = context.createGain();
  gain.gain.value = 0;
  envelope(gain.gain, span, start);
  gain.connect(out);
  return gain;
};

const filtered = (
  context: BaseAudioContext,
  type: BiquadFilterType,
  hertz: number,
  q: number,
  out: AudioNode
): BiquadFilterNode => {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = hertz;
  filter.Q.value = q;
  filter.connect(out);
  return filter;
};

const noiseSource = (
  context: BaseAudioContext,
  noise: AudioBuffer,
  random: Random,
  begin: number,
  end: number,
  out: AudioNode
): void => {
  const source = context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  source.connect(out);
  source.start(begin, random() * (noise.duration - 0.1));
  source.stop(end);
};

const crackleBuffer = (
  context: BaseAudioContext,
  perSecond: number,
  seconds: number,
  random: Random
): AudioBuffer => {
  const length = Math.max(1, Math.ceil(seconds * context.sampleRate));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const clicks = Math.ceil(perSecond * seconds);
  for (let click = 0; click < clicks; click += 1) {
    const at = Math.floor(random() * length);
    const size = (0.3 + random() * 0.7) * (random() < 0.5 ? -1 : 1);
    for (let tail = 0; tail < 4 && at + tail < length; tail += 1) {
      samples[at + tail] = size * 0.5 ** tail;
    }
  }
  return buffer;
};

const syllables = (
  param: AudioParam,
  begin: number,
  end: number,
  random: Random
): void => {
  param.setValueAtTime(0, begin);
  let at = begin + random() * 0.3;
  while (at < end) {
    const length = 0.08 + random() * 0.16;
    const level = 0.3 + random() * 0.7;
    param.linearRampToValueAtTime(0, at);
    param.linearRampToValueAtTime(level, at + length * 0.3);
    param.linearRampToValueAtTime(0, at + length);
    at += length + (random() < 0.12 ? 0.3 + random() * 0.5 : random() * 0.12);
  }
};

const renderLayer = (
  context: BaseAudioContext,
  layer: Layer,
  start: number,
  sources: Sources,
  random: Random,
  out: AudioNode
): void => {
  const begin = start + layer.at;
  const end = endOf(layer, start) + 0.01;
  const level = enveloped(context, layer, start, out);
  switch (layer.kind) {
    case "tone": {
      const tone = context.createOscillator();
      tone.type = layer.wave;
      const pitch = 1 + (random() * 2 - 1) * sources.spread;
      sweep(tone.frequency, layer.from * pitch, layer.to * pitch, begin, end);
      tone.connect(
        layer.cutoff < OPEN
          ? filtered(context, "lowpass", layer.cutoff, 0.7, level)
          : level
      );
      tone.start(begin);
      tone.stop(end);
      return;
    }
    case "noise": {
      const pitch = 1 + (random() * 2 - 1) * sources.spread;
      const filter = filtered(context, layer.band, layer.from, layer.q, level);
      sweep(filter.frequency, layer.from * pitch, layer.to * pitch, begin, end);
      noiseSource(context, sources.noise, random, begin, end, filter);
      return;
    }
    case "crackle": {
      const source = context.createBufferSource();
      source.buffer = crackleBuffer(
        context,
        layer.perSecond,
        end - begin,
        random
      );
      source.connect(filtered(context, "lowpass", layer.cutoff, 0.7, level));
      source.start(begin);
      return;
    }
    case "murmur": {
      const room = filtered(context, "lowpass", layer.cutoff, 0.7, level);
      for (let voice = 0; voice < layer.voices; voice += 1) {
        const mouth = context.createGain();
        mouth.gain.value = 0;
        syllables(mouth.gain, begin, end, random);
        const weight = context.createGain();
        weight.gain.value = (0.4 + random() * 0.6) / Math.sqrt(layer.voices);
        mouth.connect(weight).connect(room);
        const low = filtered(
          context,
          "bandpass",
          280 + random() * 500,
          4,
          mouth
        );
        const high = filtered(
          context,
          "bandpass",
          900 + random() * 1300,
          6,
          mouth
        );
        noiseSource(context, sources.noise, random, begin, end, low);
        noiseSource(context, sources.noise, random, begin, end, high);
      }
      return;
    }
    default: {
      return layer satisfies never;
    }
  }
};

interface Sources {
  readonly noise: AudioBuffer;
  readonly spread: number;
}

const renderLayers = (
  context: BaseAudioContext,
  layers: Layers,
  start: number,
  sources: Sources,
  random: Random
): void => {
  for (const layer of layers) {
    renderLayer(context, layer, start, sources, random, context.destination);
  }
};

export interface CueJob {
  readonly context: OfflineAudioContext;
  readonly seconds: number;
}

export const cueJob = (
  recipe: Recipe,
  sampleRate: number,
  noise: AudioBuffer,
  seed: number
): CueJob => {
  const seconds = recipeSeconds(recipe.layers);
  const context = new OfflineAudioContext({
    length: Math.ceil(seconds * recipe.variants * sampleRate),
    numberOfChannels: 1,
    sampleRate,
  });
  const random = seeded(seed);
  const sources = { noise, spread: recipe.spread };
  for (let variant = 0; variant < recipe.variants; variant += 1) {
    renderLayers(context, recipe.layers, variant * seconds, sources, random);
  }
  return { context, seconds };
};
