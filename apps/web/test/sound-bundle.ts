import { cues, loops } from "../src/sound/cues.ts";
import type { Cue, Loop } from "../src/sound/cues.ts";
import { engineCharacters, engineVoice } from "../src/sound/engine.ts";
import type { EngineCharacter } from "../src/sound/engine.ts";
import { loopRecipes, recipes } from "../src/sound/recipes.ts";
import {
  closeLoop,
  cueJob,
  loopJob,
  seeded,
  whiteNoise,
} from "../src/sound/render.ts";
import { scenes } from "./sound-scenes.ts";

const SAMPLE_RATE = 48_000;
const STEADY_SECONDS = 1.2;
const SWEEP_SECONDS = 4;
const FRAME_SECONDS = 1 / 60;
const BYTES_PER_CHUNK = 0x80_00;

export interface Clip {
  readonly name: string;
  readonly group: "cue" | "loop" | "engine" | "scene";
  readonly sampleRate: number;
  readonly samples: string;
  readonly problems: readonly string[];
}

const encoded = (samples: Float32Array): string => {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength
  );
  let text = "";
  for (let start = 0; start < bytes.length; start += BYTES_PER_CHUNK) {
    text += String.fromCodePoint(
      ...bytes.subarray(start, start + BYTES_PER_CHUNK)
    );
  }
  return btoa(text);
};

const steady = [
  { label: "idle", revs: 0, throttle: 0 },
  { label: "mid", revs: 0.5, throttle: 0.6 },
  { label: "redline", revs: 1, throttle: 1 },
] as const;

const sweepAt = (seconds: number): number => {
  const half = SWEEP_SECONDS / 2;
  return seconds < half ? seconds / half : (SWEEP_SECONDS - seconds) / half;
};

const clipOf = (
  group: Clip["group"],
  name: string,
  samples: Float32Array
): Clip => ({
  group,
  name,
  problems: [],
  sampleRate: SAMPLE_RATE,
  samples: encoded(samples),
});

const offline = (seconds: number): OfflineAudioContext =>
  new OfflineAudioContext({
    length: Math.ceil(seconds * SAMPLE_RATE),
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
  });

const steadyClip = async (
  name: string,
  character: EngineCharacter,
  { label, revs, throttle }: (typeof steady)[number]
): Promise<Clip> => {
  const context = offline(STEADY_SECONDS);
  engineVoice(context, character, context.destination).drive(
    true,
    revs,
    throttle,
    0
  );
  const rendered = await context.startRendering();
  return clipOf("engine", `${name}-${label}`, rendered.getChannelData(0));
};

const sweepClip = async (
  name: string,
  character: EngineCharacter
): Promise<Clip> => {
  const context = offline(SWEEP_SECONDS);
  const voice = engineVoice(context, character, context.destination);
  for (let at = 0; at < SWEEP_SECONDS; at += FRAME_SECONDS) {
    const revs = sweepAt(at);
    voice.drive(true, revs, revs > 0.05 ? 1 : 0, at);
  }
  const rendered = await context.startRendering();
  return clipOf("engine", `${name}-sweep`, rendered.getChannelData(0));
};

const engineClips = async (): Promise<Clip[]> =>
  await Promise.all(
    Object.entries(engineCharacters).flatMap(([name, character]) => [
      ...steady.map(async (state) => await steadyClip(name, character, state)),
      sweepClip(name, character),
    ])
  );

const cueClip = async (
  cue: Cue,
  index: number,
  noise: AudioBuffer
): Promise<Clip> => {
  const job = cueJob(recipes[cue], SAMPLE_RATE, noise, index + 1);
  const rendered = await job.context.startRendering();
  return clipOf("cue", cue, rendered.getChannelData(0));
};

const loopClip = async (loop: Loop, noise: AudioBuffer): Promise<Clip> => {
  const recipe = loopRecipes[loop];
  const job = loopJob(recipe, SAMPLE_RATE, noise, 99);
  const rendered = await job.context.startRendering();
  closeLoop(rendered, recipe);
  const length = Math.round(recipe.seconds * SAMPLE_RATE);
  const once = rendered.getChannelData(0).subarray(0, length);
  const twice = new Float32Array(length * 2);
  twice.set(once);
  twice.set(once, length);
  return clipOf("loop", loop, twice);
};

const sceneClips = async (): Promise<Clip[]> => {
  const staged = await scenes();
  return staged.map(({ left, name, problems, right }) => {
    const mixed = left.map(
      (sample, index) => (sample + (right[index] ?? 0)) / 2
    );
    return { ...clipOf("scene", name, mixed), problems };
  });
};

export const renderClips = async (): Promise<string> => {
  const noise = whiteNoise(offline(1), seeded(7));
  const clips = await Promise.all([
    ...cues.map(async (cue, index) => await cueClip(cue, index, noise)),
    ...loops.map(async (loop) => await loopClip(loop, noise)),
  ]);
  return JSON.stringify([
    ...clips,
    ...(await engineClips()),
    ...(await sceneClips()),
  ]);
};
