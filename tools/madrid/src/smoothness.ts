const NOISE = 1e-4;

const signChanges = (values: Iterable<number>): number => {
  let changes = 0;
  let last = 0;
  for (const value of values) {
    if (Math.abs(value) < NOISE) {
      continue;
    }
    const sign = Math.sign(value);
    if (last !== 0 && sign !== last) {
      changes += 1;
    }
    last = sign;
  }
  return changes;
};

export const signChangesPerKilometre = (
  values: Iterable<number>,
  lengthM: number
): number => (lengthM > 0 ? (signChanges(values) * 1000) / lengthM : 0);

export const maxStep = (values: Iterable<number>): number => {
  let worst = 0;
  let last = Number.NaN;
  for (const value of values) {
    if (!Number.isNaN(last)) {
      worst = Math.max(worst, Math.abs(value - last));
    }
    last = value;
  }
  return worst;
};
