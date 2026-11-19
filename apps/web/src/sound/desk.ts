import { cues } from "./cues.ts";
import type { Cue } from "./cues.ts";
import { engineCharacters, engineVoice } from "./engine.ts";
import type { EngineVoice } from "./engine.ts";
import { gainGlide, pitchGlide } from "./glide.ts";
import type { Glide } from "./glide.ts";
import { priorities, recipes } from "./recipes.ts";
import { cueJob, seeded, whiteNoise } from "./render.ts";
import type { Random } from "./render.ts";

const CHANNELS = 8;
const RUSH_SPEED = 75;
const MUTE_SECONDS = 0.02;

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
}

export interface Desk {
  readonly play: (cue: Cue, pan: number, gain: number) => void;
  readonly ride: (
    on: boolean,
    speed: number,
    throttle: number,
    revs: number,
    offRoad: boolean
  ) => void;
  readonly shift: () => void;
  readonly level: (effects: number, muted: boolean) => void;
  readonly heard: () => ReadonlyMap<Cue, number>;
  readonly stats: () => RenderStats;
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const channelOf = (context: AudioContext, out: AudioNode): Channel => {
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

interface Wind {
  readonly gain: Glide;
  readonly tone: Glide;
}

const windOf = (
  context: AudioContext,
  noise: AudioBuffer,
  out: AudioNode
): Wind => {
  const source = context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const tone = context.createBiquadFilter();
  tone.type = "bandpass";
  tone.Q.value = 0.5;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(tone).connect(gain).connect(out);
  source.start();
  return {
    gain: gainGlide(gain.gain, 0.15),
    tone: pitchGlide(tone.frequency, 0.15),
  };
};

export const openDesk = (
  context: AudioContext,
  failed: (message: string) => void
): Desk => {
  const started = performance.now();
  let busyMs = 0;
  let longestSliceMs = 0;
  const noteSlice = (slice: number): void => {
    busyMs += slice;
    longestSliceMs = Math.max(longestSliceMs, slice);
  };
  const master = context.createGain();
  master.connect(context.destination);
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(master);
  const effects = context.createGain();
  effects.connect(limiter);

  const random: Random = seeded(41);
  const noise = whiteNoise(context, random);
  const engine: EngineVoice = engineVoice(
    context,
    engineCharacters.middleweight,
    effects
  );
  const wind = windOf(context, noise, effects);
  const channels = Array.from({ length: CHANNELS }, () =>
    channelOf(context, effects)
  );
  const bank: Partial<Record<Cue, Rendered>> = {};
  const counts = new Map<Cue, number>(cues.map((cue) => [cue, 0] as const));
  let rendered = 0;
  let waitedMs = 0;

  const renderFrom = async (index: number): Promise<void> => {
    const cue = cues[index];
    if (cue === undefined) {
      waitedMs = performance.now() - started;
      return;
    }
    const recipe = recipes[cue];
    const sliceStart = performance.now();
    const job = cueJob(recipe, context.sampleRate, noise, index + 1);
    noteSlice(performance.now() - sliceStart);
    const buffer = await job.context.startRendering();
    bank[cue] = {
      buffer,
      next: 0,
      rank: priorities.indexOf(recipe.priority),
      seconds: job.seconds,
      spread: recipe.spread,
      variants: recipe.variants,
    };
    rendered += 1;
    await renderFrom(index + 1);
  };
  const renderBank = async (): Promise<void> => {
    try {
      await renderFrom(0);
    } catch (error) {
      failed(messageOf(error));
    }
  };
  noteSlice(performance.now() - started);
  void renderBank();

  const play = (cue: Cue, pan: number, gain: number): void => {
    const take = bank[cue];
    if (!take) {
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

  const stream = (): MediaStream => {
    const tap = context.createMediaStreamDestination();
    master.connect(tap);
    return tap.stream;
  };
  const stats = (): RenderStats => ({
    busyMs,
    longestSliceMs,
    rendered,
    waitedMs,
  });
  Reflect.set(globalThis, "__rushlineSound", {
    heard: () => Object.fromEntries(counts),
    record: async (seconds: number): Promise<string | null> => {
      if (!new URLSearchParams(globalThis.location.search).has("prof")) {
        return null;
      }
      const { recordTap } = await import("./tap.ts");
      return await recordTap(stream(), seconds);
    },
    stats,
  });

  return {
    heard: () => counts,
    level(volume, muted) {
      const now = context.currentTime;
      effects.gain.setTargetAtTime(volume, now, MUTE_SECONDS);
      master.gain.setTargetAtTime(muted ? 0 : 1, now, MUTE_SECONDS);
    },
    play,
    ride(on, speed, throttle, revs, offRoad) {
      const now = context.currentTime;
      engine.drive(on, revs, throttle, now);
      const rush = on ? Math.min(1, speed / RUSH_SPEED) : 0;
      wind.gain(rush * rush * 0.26 + (on && offRoad ? 0.12 : 0), now);
      wind.tone(offRoad ? 240 : 500 + rush * 1100, now);
    },
    shift() {
      engine.dip(context.currentTime);
      play("shift", 0, 1);
    },
    stats,
  };
};
