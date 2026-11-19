const FRAME = 4096;
const CEILING = 10 ** (-1 / 20);
const FLOOR = 10 ** (-40 / 20);
const MAX_DC = 0.01;
const SEAM_SHARE = 0.25;
const PCM_SCALE = 32_767;
const HEADER_BYTES = 44;

export interface Measure {
  readonly name: string;
  readonly seconds: number;
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly dc: number;
  readonly clipped: number;
  readonly centroid: number;
}

const decibels = (level: number): number =>
  level > 0 ? 20 * Math.log10(level) : -Infinity;

const reversed = (index: number, bits: number): number => {
  let rest = index;
  let out = 0;
  for (let bit = 0; bit < bits; bit += 1) {
    out = out * 2 + (rest % 2);
    rest = Math.floor(rest / 2);
  }
  return out;
};

const transform = (real: Float64Array, imag: Float64Array): void => {
  const size = real.length;
  const bits = Math.round(Math.log2(size));
  for (let index = 0; index < size; index += 1) {
    const other = reversed(index, bits);
    if (other > index) {
      const re = real[index] ?? 0;
      real[index] = real[other] ?? 0;
      real[other] = re;
    }
  }
  for (let span = 2; span <= size; span *= 2) {
    const angle = (-2 * Math.PI) / span;
    for (let start = 0; start < size; start += span) {
      for (let step = 0; step < span / 2; step += 1) {
        const cos = Math.cos(angle * step);
        const sin = Math.sin(angle * step);
        const at = start + step;
        const far = at + span / 2;
        const farRe = real[far] ?? 0;
        const farIm = imag[far] ?? 0;
        const turnedRe = farRe * cos - farIm * sin;
        const turnedIm = farRe * sin + farIm * cos;
        const nearRe = real[at] ?? 0;
        const nearIm = imag[at] ?? 0;
        real[at] = nearRe + turnedRe;
        imag[at] = nearIm + turnedIm;
        real[far] = nearRe - turnedRe;
        imag[far] = nearIm - turnedIm;
      }
    }
  }
};

const centroidOf = (samples: Float32Array, sampleRate: number): number => {
  const real = new Float64Array(FRAME);
  const imag = new Float64Array(FRAME);
  let weighted = 0;
  let total = 0;
  for (let start = 0; start + FRAME <= samples.length; start += FRAME / 2) {
    for (let index = 0; index < FRAME; index += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FRAME - 1));
      real[index] = (samples[start + index] ?? 0) * window;
      imag[index] = 0;
    }
    transform(real, imag);
    for (let bin = 1; bin < FRAME / 2; bin += 1) {
      const power = (real[bin] ?? 0) ** 2 + (imag[bin] ?? 0) ** 2;
      weighted += power * ((bin * sampleRate) / FRAME);
      total += power;
    }
  }
  return total > 0 ? weighted / total : 0;
};

export const measure = (
  name: string,
  samples: Float32Array,
  sampleRate: number
): Measure => {
  let peak = 0;
  let squares = 0;
  let sum = 0;
  let clipped = 0;
  for (const sample of samples) {
    const size = Math.abs(sample);
    peak = Math.max(peak, size);
    squares += sample * sample;
    sum += sample;
    clipped += size >= 1 ? 1 : 0;
  }
  const count = Math.max(1, samples.length);
  return {
    centroid: centroidOf(samples, sampleRate),
    clipped,
    dc: sum / count,
    name,
    peakDb: decibels(peak),
    rmsDb: decibels(Math.sqrt(squares / count)),
    seconds: samples.length / sampleRate,
  };
};

export const seamJump = (samples: Float32Array): number => {
  const half = samples.length / 2;
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  const jump = Math.abs((samples[half] ?? 0) - (samples[half - 1] ?? 0));
  return peak > 0 ? jump / peak : 0;
};

export const problemsOf = (
  measures: readonly Measure[],
  seams: ReadonlyMap<string, number>
): readonly string[] => {
  const problems: string[] = [];
  for (const each of measures) {
    if (each.peakDb > decibels(CEILING)) {
      problems.push(`${each.name} peaks at ${each.peakDb.toFixed(1)} dBFS.`);
    }
    if (each.peakDb < decibels(FLOOR)) {
      problems.push(`${each.name} is nearly silent.`);
    }
    if (each.clipped > 0) {
      problems.push(`${each.name} clips ${each.clipped} samples.`);
    }
    if (Math.abs(each.dc) > MAX_DC) {
      problems.push(`${each.name} has a DC offset of ${each.dc.toFixed(3)}.`);
    }
  }
  for (const [name, jump] of seams) {
    if (jump > SEAM_SHARE) {
      problems.push(`${name} jumps at its loop seam.`);
    }
  }
  return problems;
};

export const brighterThan = (
  measures: readonly Measure[],
  pairs: readonly (readonly [string, string])[]
): readonly string[] => {
  const centroid = new Map(measures.map((each) => [each.name, each.centroid]));
  return pairs.flatMap(([dull, bright]) => {
    const low = centroid.get(dull);
    const high = centroid.get(bright);
    return low !== undefined && high !== undefined && low < high
      ? []
      : [`${bright} should sound brighter than ${dull}.`];
  });
};

export const wavOf = (samples: Float32Array, sampleRate: number): Buffer => {
  const data = samples.length * 2;
  const file = Buffer.alloc(HEADER_BYTES + data);
  file.write("RIFF", 0, "ascii");
  file.writeUInt32LE(36 + data, 4);
  file.write("WAVE", 8, "ascii");
  file.write("fmt ", 12, "ascii");
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(sampleRate, 24);
  file.writeUInt32LE(sampleRate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write("data", 36, "ascii");
  file.writeUInt32LE(data, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    file.writeInt16LE(
      Math.round(clamped * PCM_SCALE),
      HEADER_BYTES + index * 2
    );
  }
  return file;
};
