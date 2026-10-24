import { decodeCorridor } from "./madrid-schema.ts";
import type { CorridorData, Position } from "./madrid-schema.ts";

const round = (value: number): number => Math.round(value * 10) / 10;
const distance = (a: Position, b: Position): number => {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  return Math.hypot(x, y);
};
const polylineLength = (line: readonly Position[]): number => {
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

const connected = (data: CorridorData): void => {
  const bridgeSources = new Set(
    data.landmarks.map((landmark) => landmark.wikidata)
  );
  const links = data.streets.flatMap((street) => street.links);
  if (
    links.some(
      (link) => link.bridge !== null && !bridgeSources.has(link.bridge)
    )
  ) {
    throw new Error("Bridge has no pinned Wikidata source");
  }
  let previous: Position | undefined;
  let previousNode: string | undefined;
  let length = 0;
  let previousEnd = 0;
  const visited = new Set<string>();
  for (const street of data.streets) {
    if (street.startM !== previousEnd || street.endM <= street.startM) {
      throw new Error(`Invalid chainage at ${street.name}`);
    }
    for (const link of street.links) {
      if (previousNode !== undefined && previousNode !== link.from) {
        throw new Error(`Disconnected node at ${link.id}`);
      }
      if (visited.has(link.from)) {
        throw new Error(`Repeated route node ${link.from}`);
      }
      visited.add(link.from);
      const [first] = link.centreline;
      if (previous && distance(previous, first) !== 0) {
        throw new Error(`Disconnected geometry at ${link.id}`);
      }
      length += polylineLength(link.centreline);
      previous = link.centreline.at(-1);
      previousNode = link.to;
    }
    if (round(length) !== street.endM) {
      throw new Error(`Wrong street length at ${street.name}`);
    }
    previousEnd = street.endM;
  }
  if (previousNode !== undefined && visited.has(previousNode)) {
    throw new Error("Finish repeats a route node");
  }
  if (round(length) !== data.lengthM) {
    throw new Error("Wrong corridor length");
  }
  if (
    data.elevation[0].atM !== 0 ||
    data.elevation.at(-1)?.atM !== data.lengthM
  ) {
    throw new Error("Elevation does not cover the complete chain");
  }
};

export const readCorridor = (text: string): CorridorData => {
  const data = decodeCorridor(JSON.parse(text));
  connected(data);
  return data;
};
