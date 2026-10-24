import type { CorridorData, Position } from "@racer/track/madrid-schema";
import proj4 from "proj4";

export const origin: Position = [437_000, 4_473_000];
export const round = (value: number): number => Math.round(value * 10) / 10;
const projection = proj4(
  "EPSG:4326",
  "+proj=utm +zone=30 +ellps=GRS80 +units=m +no_defs"
);
export const project = (point: Position): Position => {
  const [x, y] = projection.forward([point[0], point[1]]);
  if (x === undefined || y === undefined) {
    throw new Error("Projection returned no coordinate");
  }
  return [round(x - origin[0]), round(y - origin[1])];
};
export const distance = (a: Position, b: Position): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

export const nearest = (point: Position, line: readonly Position[]) => {
  let best = { atM: 0, distanceM: Infinity };
  let atM = 0;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (!(a && b)) {
      continue;
    }
    const length = distance(a, b);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
                (length * length)
            )
          );
    const gap = distance(point, [a[0] + t * dx, a[1] + t * dy]);
    if (gap < best.distanceM) {
      best = { atM: atM + t * length, distanceM: gap };
    }
    atM += length;
  }
  return best;
};

export const inside = (point: Position, ring: readonly Position[]): boolean => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a &&
      b &&
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      result = !result;
    }
  }
  return result;
};

export const simplify = (ring: readonly Position[]): Position[] => {
  const result: Position[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = result.at(-1);
    const b = ring[i];
    const c = ring[i + 1];
    if (b && (!a || !c || nearest(b, [a, c]).distanceM > 0.6)) {
      result.push(b);
    }
  }
  return result;
};

export const polylineLength = (line: readonly Position[]): number => {
  let length = 0;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (a && b) {
      length += distance(a, b);
    }
  }
  return length;
};

const cross = (a: Position, b: Position, c: Position): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const intersects = (
  a: Position,
  b: Position,
  c: Position,
  d: Position
): boolean =>
  Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
  Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
  Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
  Math.max(c[1], d[1]) >= Math.min(a[1], b[1]) &&
  cross(a, b, c) * cross(a, b, d) <= 0 &&
  cross(c, d, a) * cross(c, d, b) <= 0;

export const nearCorridor = (
  ring: readonly Position[],
  line: readonly Position[],
  bufferM: number
): boolean => {
  if (
    ring.some((p) => nearest(p, line).distanceM <= bufferM) ||
    line.some((p) => inside(p, ring))
  ) {
    return true;
  }
  for (let i = 1; i < ring.length; i += 1) {
    const a = ring[i - 1];
    const b = ring[i];
    if (!(a && b)) {
      continue;
    }
    if (line.some((p) => nearest(p, [a, b]).distanceM <= bufferM)) {
      return true;
    }
    for (let j = 1; j < line.length; j += 1) {
      const c = line[j - 1];
      const d = line[j];
      if (c && d && intersects(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
};

export const pointAlong = (
  line: readonly [Position, ...Position[]],
  atM: number
): Position => {
  let [previous] = line;
  let remaining = atM;
  for (const current of line.slice(1)) {
    const length = distance(previous, current);
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return [
        previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t,
      ];
    }
    remaining -= length;
    previous = current;
  }
  return previous;
};

export const corridorLine = (data: CorridorData): [Position, ...Position[]] => {
  const [firstStreet, ...laterStreets] = data.streets;
  const [firstLink, ...laterLinks] = firstStreet.links;
  const line: [Position, ...Position[]] = [...firstLink.centreline];
  for (const link of [
    ...laterLinks,
    ...laterStreets.flatMap((street) => street.links),
  ]) {
    line.push(...link.centreline.slice(1));
  }
  return line;
};

export const between = (
  line: readonly [Position, ...Position[]],
  fromM: number,
  toM: number
): [Position, ...Position[]] => {
  const result: [Position, ...Position[]] = [pointAlong(line, fromM)];
  let atM = 0;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (a && b) {
      atM += distance(a, b);
      if (atM > fromM && atM < toM) {
        result.push(b);
      }
    }
  }
  result.push(pointAlong(line, toM));
  return result;
};
