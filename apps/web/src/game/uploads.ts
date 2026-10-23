import type * as THREE from "three";

export const uploadSpan = (
  attribute: THREE.BufferAttribute,
  from: number,
  to: number
): void => {
  if (to <= from) {
    return;
  }
  let start = from * attribute.itemSize;
  let end = to * attribute.itemSize;
  for (const range of attribute.updateRanges) {
    start = Math.min(start, range.start);
    end = Math.max(end, range.start + range.count);
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(start, end - start);
  attribute.needsUpdate = true;
};
