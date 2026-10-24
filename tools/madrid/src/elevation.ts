import type { Position } from "@racer/track/madrid-schema";

import { distance, origin, round } from "./geometry.ts";

export const buildElevation = (text: string, line: readonly Position[]) => {
  const rows = text.trim().split(/\r?\n/u);
  const headers = new Map<string, number>();
  while (/^[a-z]/iu.test(rows[0] ?? "")) {
    const [key, value] = (rows.shift() ?? "").trim().split(/\s+/u);
    if (key !== undefined && value !== undefined) {
      headers.set(key.toLowerCase(), Number(value));
    }
  }
  const cols = headers.get("ncols");
  const rowCount = headers.get("nrows");
  const x0 = headers.get("xllcorner");
  const y0 = headers.get("yllcorner");
  const cell = headers.get("cellsize");
  if (
    cols === undefined ||
    rowCount === undefined ||
    x0 === undefined ||
    y0 === undefined ||
    cell !== 5 ||
    rows.length !== rowCount
  ) {
    throw new Error("IGN MDT05 raster header or coverage changed");
  }
  const grid = rows.map((row) => row.trim().split(/\s+/u).map(Number));
  const sample = (p: Position): number => {
    const x = Math.floor((p[0] + origin[0] - x0) / cell);
    const y = rowCount - 1 - Math.floor((p[1] + origin[1] - y0) / cell);
    const value = grid[y]?.[x];
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value === headers.get("nodata_value")
    ) {
      throw new Error("Route left the valid MDT05 raster");
    }
    return round(value);
  };
  const [first] = line;
  if (!first) {
    throw new Error("Cannot sample an empty road");
  }
  const firstSample = { atM: 0, groundM: sample(first) };
  const elevation = [firstSample];
  let atM = 0;
  let next = 10;
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (!(a && b)) {
      continue;
    }
    const length = distance(a, b);
    while (next <= atM + length) {
      const t = (next - atM) / length;
      elevation.push({
        atM: next,
        groundM: sample([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]),
      });
      next += 10;
    }
    atM += length;
  }
  const last = line.at(-1);
  if (last && elevation.at(-1)?.atM !== round(atM)) {
    elevation.push({ atM: round(atM), groundM: sample(last) });
  }
  return [firstSample, ...elevation.slice(1)] as const;
};
