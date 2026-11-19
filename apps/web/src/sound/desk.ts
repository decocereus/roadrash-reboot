import type { RaceView } from "@racer/sim/race-view";
import type { BikeClass, RiderId } from "@racer/sim/state";

import { engineCharacters } from "./characters.ts";
import { cues, loops } from "./cues.ts";
import type { Cue, Loop } from "./cues.ts";
import { engineVoice } from "./engine.ts";
import type { EngineVoice } from "./engine.ts";
import { gainGlide, pitchGlide } from "./glide.ts";
import type { Glide } from "./glide.ts";
import { hearPassing, PASSING_VOICES, passingVoices } from "./passing.ts";
import type { Passing } from "./passing.ts";
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
import type { Ride } from "./sound.ts";

const CHANNELS = 8;
const NOISE_CHUNK = 16_384;
const LATE_SECONDS = 0.4;
const RUSH_SPEED = 75;
const MUTE_SECONDS = 0.02;
const LOOP_SECONDS = 0.3;
const SCRUB_FROM = 0.6;
const SCRUB_SPEED = 30;

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
  readonly ride: (ride: Ride) => void;
  readonly hear: (view: RaceView, me: RiderId) => void;
  readonly hush: () => void;
  readonly shift: () => void;
  readonly hush: () => void;
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

interface Band {
  readonly gain: Glide;
  readonly tone: Glide;
}

const bandOf = (
  context: BaseAudioContext,
  noise: AudioBuffer,
  q: number,
  seconds: number,
  offset: number,
  out: AudioNode
): Band => {
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
  return {
    gain: gainGlide(gain.gain, seconds),
    tone: pitchGlide(tone.frequency, seconds),
  };
};

interface PassingVoice {
  readonly low: OscillatorNode;
  readonly high: OscillatorNode;
  readonly pitch: Glide;
  readonly under: Glide;
  readonly cutoff: Glide;
  readonly gain: Glide;
  readonly pan: Glide;
  readonly mix: GainNode;
}

const passingVoiceOf = (
  context: BaseAudioContext,
  out: AudioNode
): PassingVoice => {
  const high = context.createOscillator();
  high.type = "sawtooth";
  const low = context.createOscillator();
  low.type = "square";
  const mix = context.createGain();
  mix.gain.value = 0.5;
  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  const gain = context.createGain();
  gain.gain.value = 0;
  const pan = context.createStereoPanner();
  high.connect(tone);
  low.connect(mix).connect(tone);
  tone.connect(gain).connect(pan).connect(out);
  high.start();
  low.start();
  return {
    cutoff: pitchGlide(tone.frequency, 0.08),
    gain: gainGlide(gain.gain, 0.08),
    high,
    low,
    mix,
    pan: gainGlide(pan.pan, 0.05),
    pitch: pitchGlide(high.frequency, 0.06),
    under: pitchGlide(low.frequency, 0.06),
  };
};

const scrubOf = ({ brake, lean, on, speed }: Ride): number => {
  if (!on) {
    return 0;
  }
  const fast = Math.min(1, speed / SCRUB_SPEED);
  const hard = Math.max(0, (Math.abs(lean) - SCRUB_FROM) / (1 - SCRUB_FROM));
  return fast * Math.min(1, hard * 0.8 + brake * 0.6) * 0.2;
};

const tunePassing = (voice: Passing, out: PassingVoice, now: number): void => {
  if (voice.fresh) {
    out.high.frequency.cancelScheduledValues(now);
    out.high.frequency.setValueAtTime(voice.hertz, now);
    out.low.frequency.cancelScheduledValues(now);
    out.low.frequency.setValueAtTime(voice.hertz / 2, now);
    out.mix.gain.setValueAtTime(voice.bike ? 0.5 : 1, now);
  }
  out.pitch(voice.hertz, now);
  out.under(voice.hertz / 2, now);
  out.cutoff(voice.cutoff, now);
  out.gain(voice.gain, now);
  out.pan(voice.pan, now);
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
  let wind: Band | null = null;
  let scrub: Band | null = null;
  const passing = passingVoices();
  const passingOut: PassingVoice[] = [];
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

  const renderFrom = async (index: number): Promise<void> => {
    const cue = cues[index];
    if (cue === undefined) {
      return;
    }
    const recipe = recipes[cue];
    const sliceStart = performance.now();
    const job = cueJob(recipe, context.sampleRate, noise, index + 1);
    noteSlice(performance.now() - sliceStart);
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
    glide(loopWanted.get(loop) ?? 0, context.currentTime);
    loopGains.set(loop, glide);
  };

  const stepFrom = async (
    steps: readonly (() => void)[],
    index: number
  ): Promise<void> => {
    const step = steps[index];
    if (step === undefined) {
      return;
    }
    timed(step);
    await nextTask();
    await stepFrom(steps, index + 1);
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
        wind = bandOf(context, noise, 0.5, 0.15, 0, effects);
        scrub = bandOf(context, noise, 1.4, 0.06, 0.5, effects);
      });
      await nextTask();
      timed(() => {
        for (let index = 0; index < PASSING_VOICES; index += 1) {
          passingOut.push(passingVoiceOf(context, effects));
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
      passing.map(({ gain, key, pan }) => ({
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
      if (passingOut.length === 0) {
        return;
      }
      const now = context.currentTime;
      hearPassing(view, me, passing);
      for (let index = 0; index < passing.length; index += 1) {
        const voice = passing[index];
        const out = passingOut[index];
        if (voice && out) {
          tunePassing(voice, out, now);
        }
      }
    },
    heard: () => counts,
    hush() {
      const now = context.currentTime;
      engine?.drive(false, 0, 0, now);
      wind?.gain(0, now);
      scrub?.gain(0, now);
      for (const out of passingOut) {
        out.gain(0, now);
      }
    },
    level(next) {
      const now = context.currentTime;
      effects.gain.setTargetAtTime(next.volume, now, MUTE_SECONDS);
      master.gain.setTargetAtTime(next.muted ? 0 : 1, now, MUTE_SECONDS);
    },
    loop(loop, gain) {
      loopWanted.set(loop, gain);
      loopGains.get(loop)?.(gain, context.currentTime);
    },
    play,
    ride(ride) {
      const now = context.currentTime;
      const { bikeClass, offRoad, on, revs, speed, throttle } = ride;
      if (on && bikeClass !== engineClass) {
        engine?.stop();
        engine = engineVoice(context, engineCharacters[bikeClass], effects);
        engineClass = bikeClass;
      }
      engine?.drive(on, revs, throttle, now);
      const rush = on ? Math.min(1, speed / RUSH_SPEED) : 0;
      wind?.gain(rush * rush * 0.26 + (on && offRoad ? 0.12 : 0), now);
      wind?.tone(offRoad ? 240 : 500 + rush * 1100, now);
      scrub?.gain(offRoad ? 0 : scrubOf(ride), now);
      scrub?.tone(1000 + ride.brake * 700, now);
    },
    shift() {
      engine?.dip(context.currentTime);
      play("shift", 0, 1);
    },
    stats,
  };
};
