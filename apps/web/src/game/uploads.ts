import type * as THREE from "three";

const keptRanges = new WeakSet<THREE.BufferAttribute>();

const keepRange = (attribute: THREE.BufferAttribute): void => {
  keptRanges.add(attribute);
  const range = { count: 0, start: 0 };
  const ranges = attribute.updateRanges;
  const held = () => {
    if (ranges.length !== 1 || ranges[0] !== range) {
      ranges.length = 0;
      ranges.push(range);
    }
  };
  attribute.addUpdateRange = (start: number, count: number) => {
    held();
    range.start = start;
    range.count = count;
  };
  attribute.clearUpdateRanges = () => {
    held();
    range.count = 0;
  };
};

export const uploadSpan = (
  attribute: THREE.BufferAttribute,
  from: number,
  to: number
): void => {
  if (to <= from) {
    return;
  }
  if (!keptRanges.has(attribute)) {
    keepRange(attribute);
  }
  let start = from * attribute.itemSize;
  let end = to * attribute.itemSize;
  for (const { count, start: first } of attribute.updateRanges) {
    if (count > 0 && first < start) {
      start = first;
    }
    if (count > 0 && first + count > end) {
      end = first + count;
    }
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(start, end - start);
  attribute.needsUpdate = true;
};
