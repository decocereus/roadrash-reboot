import type { RaceView } from "@racer/sim/race-view";
import type { BikeClass, RiderId } from "@racer/sim/state";

import { engineCharacters } from "./characters.ts";
import { cues, loops } from "./cues.ts";
import type { Cue, Loop } from "./cues.ts";
import { engineVoice } from "./engine.ts";
import type { EngineVoice } from "./engine.ts";
import { gainGlide } from "./glide.ts";
import type { Glide } from "./glide.ts";
import { PASSING_VOICES } from "./passing.ts";
import {
  bandControl,
  createRaceMix,
  hearMix,
  hushMix,
  passingOut,
  rideMix,
} from "./race-mix.ts";
import type { BandParams, PassingParams, Ride } from "./race-mix.ts";
import { loopRecipes, priorities, recipes } from "./recipes.ts";
import {
  closeLoop,
  cueJob,
  fillNoise,
  loopJob,
  noiseBuffer,
  seeded,
} from "./render.ts";
import type { Random } from "./render.ts";

const CHANNELS = 8;
const NOISE_CHUNK = 16_384;
const LATE_SECONDS = 0.4;
const MUTE_SECONDS = 0.02;
const LOOP_SECONDS = 0.3;
const STEP_MS = 1.5;

interface Channel {
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  source: AudioBufferSourceNode | null;
  endsAt: number;
  rank: number;
}

interface Rendered {
  readonly buffer: AudioBuffer;
  readonly seconds: number;
  readonly variants: number;
  readonly spread: number;
  readonly rank: number;
  next: number;
}

interface RenderStats {
  readonly rendered: number;
  readonly waitedMs: number;
  readonly busyMs: number;
  readonly longestSliceMs: number;
  readonly slices: readonly number[];
}

export interface Level {
  readonly volume: number;
  readonly muted: boolean;
}

export interface Desk {
  readonly play: (cue: Cue, pan: number, gain: number) => void;
  readonly prepare: (bikeClass: BikeClass) => void;
  readonly ride: (ride: Ride) => void;
  readonly hear: (view: RaceView, me: RiderId) => void;
  readonly hush: () => void;
  readonly shift: () => void;
  readonly loop: (loop: Loop, gain: number) => void;
  readonly level: (level: Level) => void;
  readonly heard: () => ReadonlyMap<Cue, number>;
  readonly stats: () => RenderStats;
}

const nextTask = async (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, 0);
  await promise;
};

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const channelOf = (context: BaseAudioContext, out: AudioNode): Channel => {
  const gain = context.createGain();
  const pan = context.createStereoPanner();
  gain.connect(pan).connect(out);
  return { endsAt: 0, gain, pan, rank: 0, source: null };
};

const freeChannel = (
  channels: readonly Channel[],
  rank: number,
  now: number
): Channel | null => {
  let chosen: Channel | null = null;
  for (const channel of channels) {
    if (channel.endsAt <= now) {
      return channel;
    }
    if (
      channel.rank <= rank &&
      (chosen === null ||
        channel.rank < chosen.rank ||
        (channel.rank === chosen.rank && channel.endsAt < chosen.endsAt))
    ) {
      chosen = channel;
    }
  }
  return chosen;
};

const bandOf = (
  context: BaseAudioContext,
  noise: AudioBuffer,
  q: number,
  offset: number,
  out: AudioNode
): BandParams => {
  const source = context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const tone = context.createBiquadFilter();
  tone.type = "bandpass";
  tone.Q.value = q;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(tone).connect(gain).connect(out);
  source.start(0, noise.duration * offset);
  return { gain: gain.gain, tone: tone.frequency };
};

const passingVoiceOf = (
  context: BaseAudioContext,
  out: AudioNode
): PassingParams => {
  const high = context.createOscillator();
  high.type = "sawtooth";
  const low = context.createOscillator();
  low.type = "square";
  const mix = context.createGain();
  mix.gain.value = 0.5;
  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  const level = context.createGain();
  level.gain.value = 0;
  const gate = context.createGain();
  gate.gain.value = 1;
  const pan = context.createStereoPanner();
  high.connect(tone);
  low.connect(mix).connect(tone);
  tone.connect(level).connect(gate).connect(pan).connect(out);
  high.start();
  low.start();
  return {
    gate: gate.gain,
    high: high.frequency,
    level: level.gain,
    low: low.frequency,
    mix: mix.gain,
    pan: pan.pan,
    tone: tone.frequency,
  };
};

export const openDesk = (
  context: BaseAudioContext,
  failed: (message: string) => void,
  { muted, volume }: Level
): Desk => {
  const started = performance.now();
  let busyMs = 0;
  let longestSliceMs = 0;
  const slices: number[] = [];
  const noteSlice = (slice: number): void => {
    slices.push(Math.round(slice * 10) / 10);
    busyMs += slice;
    longestSliceMs = Math.max(longestSliceMs, slice);
  };
  const master = context.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(context.destination);
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(master);
  const effects = context.createGain();
  effects.gain.value = volume;
  effects.connect(limiter);

  const random: Random = seeded(41);
  const noise = noiseBuffer(context);
  let engine: EngineVoice | null = null;
  let engineClass: BikeClass | null = null;
  const mix = createRaceMix();
  let waiting: Cue | null = null;
  let waitingPan = 0;
  let waitingGain = 1;
  let waitingSince = 0;
  const channels: Channel[] = [];
  const bank: Partial<Record<Cue, Rendered>> = {};
  const counts = new Map<Cue, number>(cues.map((cue) => [cue, 0] as const));
  const loopWanted = new Map<Loop, number>(
    loops.map((loop) => [loop, 0] as const)
  );
  const loopGains = new Map<Loop, Glide>();
  let rendered = 0;
  let waitedMs = 0;

  const play = (cue: Cue, pan: number, gain: number): void => {
    const take = bank[cue];
    if (!take) {
      waiting = cue;
      waitingPan = pan;
      waitingGain = gain;
      waitingSince = context.currentTime;
      return;
    }
    const now = context.currentTime;
    const channel = freeChannel(channels, take.rank, now);
    if (!channel) {
      return;
    }
    channel.source?.stop(now);
    const source = context.createBufferSource();
    source.buffer = take.buffer;
    const rate = 1 + (random() * 2 - 1) * take.spread * 0.5;
    source.playbackRate.value = rate;
    channel.gain.gain.setValueAtTime(gain, now);
    channel.pan.pan.setValueAtTime(pan, now);
    source.connect(channel.gain);
    source.start(now, take.next * take.seconds, take.seconds);
    take.next = (take.next + 1) % take.variants;
    channel.source = source;
    channel.endsAt = now + take.seconds / rate;
    channel.rank = take.rank;
    counts.set(cue, (counts.get(cue) ?? 0) + 1);
  };

  const timed = (work: () => void): void => {
    const sliceStart = performance.now();
    work();
    noteSlice(performance.now() - sliceStart);
  };

  const fillFrom = async (from: number): Promise<void> => {
    timed(() => {
      fillNoise(noise, random, from, from + NOISE_CHUNK);
    });
    await nextTask();
    if (from + NOISE_CHUNK < noise.length) {
      await fillFrom(from + NOISE_CHUNK);
    }
  };

  const stepFrom = async (
    steps: readonly (() => void)[],
    index: number
  ): Promise<void> => {
    if (index >= steps.length) {
      return;
    }
    const sliceStart = performance.now();
    let at = index;
    while (at < steps.length && performance.now() - sliceStart < STEP_MS) {
      steps[at]?.();
      at += 1;
    }
    noteSlice(performance.now() - sliceStart);
    await nextTask();
    await stepFrom(steps, at);
  };

  const renderFrom = async (index: number): Promise<void> => {
    const cue = cues[index];
    if (cue === undefined) {
      return;
    }
    const recipe = recipes[cue];
    const sliceStart = performance.now();
    const job = cueJob(recipe, context.sampleRate, noise, index + 1);
    noteSlice(performance.now() - sliceStart);
    await stepFrom(job.steps, 0);
    const buffer = await job.context.startRendering();
    await nextTask();
    bank[cue] = {
      buffer,
      next: 0,
      rank: priorities.indexOf(recipe.priority),
      seconds: job.seconds,
      spread: recipe.spread,
      variants: recipe.variants,
    };
    rendered += 1;
    if (waiting === cue) {
      waiting = null;
      if (context.currentTime - waitingSince < LATE_SECONDS) {
        play(cue, waitingPan, waitingGain);
      }
    }
    await renderFrom(index + 1);
  };
  const startLoop = (loop: Loop, buffer: AudioBuffer): void => {
    const recipe = loopRecipes[loop];
    closeLoop(buffer, recipe);
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(effects);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopEnd = recipe.seconds;
    source.connect(gain);
    source.start();
    const glide = gainGlide(gain.gain, LOOP_SECONDS);
    glide.to(loopWanted.get(loop) ?? 0, context.currentTime);
    loopGains.set(loop, glide);
  };

  const renderLoopFrom = async (index: number): Promise<void> => {
    const loop = loops[index];
    if (loop === undefined) {
      waitedMs = performance.now() - started;
      return;
    }
    const sliceStart = performance.now();
    const job = loopJob(
      loopRecipes[loop],
      context.sampleRate,
      noise,
      100 + index
    );
    noteSlice(performance.now() - sliceStart);
    await stepFrom(job.steps, 0);
    const buffer = await job.context.startRendering();
    await nextTask();
    timed(() => {
      startLoop(loop, buffer);
    });
    rendered += 1;
    await renderLoopFrom(index + 1);
  };

  const renderBank = async (): Promise<void> => {
    try {
      await nextTask();
      timed(() => {
        for (let index = 0; index < CHANNELS; index += 1) {
          channels.push(channelOf(context, effects));
        }
      });
      await nextTask();
      await fillFrom(0);
      timed(() => {
        mix.wind = bandControl(bandOf(context, noise, 0.5, 0, effects), 0.15);
        mix.scrub = bandControl(
          bandOf(context, noise, 1.4, 0.5, effects),
          0.06
        );
      });
      await nextTask();
      timed(() => {
        for (let index = 0; index < PASSING_VOICES; index += 1) {
          mix.outs.push(passingOut(passingVoiceOf(context, effects)));
        }
      });
      await renderFrom(0);
      await renderLoopFrom(0);
    } catch (error) {
      failed(messageOf(error));
    }
  };
  noteSlice(performance.now() - started);
  void renderBank();

  const stream = (): MediaStream | null => {
    if (!(context instanceof AudioContext)) {
      return null;
    }
    const tap = context.createMediaStreamDestination();
    master.connect(tap);
    return tap.stream;
  };
  const stats = (): RenderStats => ({
    busyMs,
    longestSliceMs,
    rendered,
    slices,
    waitedMs,
  });
  Reflect.set(globalThis, "__rushlineSound", {
    heard: () => Object.fromEntries(counts),
    looping: () =>
      Object.fromEntries(
        loops.map((loop) => [
          loop,
          loopGains.has(loop) ? (loopWanted.get(loop) ?? 0) : null,
        ])
      ),
    passing: () =>
      mix.passing.map(({ gain, key, pan }) => ({
        gain: Math.round(gain * 1000) / 1000,
        key,
        pan: Math.round(pan * 100) / 100,
      })),
    record: async (seconds: number): Promise<string | null> => {
      if (!new URLSearchParams(globalThis.location.search).has("prof")) {
        return null;
      }
      const tapped = stream();
      if (!tapped) {
        return null;
      }
      const { recordTap } = await import("./tap.ts");
      return await recordTap(tapped, seconds);
    },
    stats,
  });

  return {
    hear(view, me) {
      hearMix(mix, view, me, context.currentTime);
    },
    heard: () => counts,
    hush() {
      hushMix(mix, context.currentTime);
    },
    level(next) {
      const now = context.currentTime;
      effects.gain.setTargetAtTime(next.volume, now, MUTE_SECONDS);
      master.gain.setTargetAtTime(next.muted ? 0 : 1, now, MUTE_SECONDS);
    },
    loop(loop, gain) {
      loopWanted.set(loop, gain);
      loopGains.get(loop)?.to(gain, context.currentTime);
    },
    play,
    prepare(bikeClass) {
      if (bikeClass === engineClass) {
        return;
      }
      engine?.stop();
      engine = engineVoice(context, engineCharacters[bikeClass], effects);
      engineClass = bikeClass;
      mix.engine = engine;
    },
    ride(ride) {
      rideMix(mix, ride, context.currentTime);
    },
    shift() {
      engine?.dip(context.currentTime);
      play("shift", 0, 1);
    },
    stats,
  };
};
