import * as Schema from "effect/Schema";

const sourceMap = Schema.Struct({
  mappings: Schema.String,
  names: Schema.Array(Schema.String),
  sources: Schema.Array(Schema.String),
  sourcesContent: Schema.optionalKey(
    Schema.Array(Schema.NullOr(Schema.String))
  ),
});

type SourceMap = typeof sourceMap.Type;

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VLQ_BASE = 32;

const decodeVlq = (text: string): number[] => {
  const values: number[] = [];
  let value = 0;
  let scale = 1;
  for (const char of text) {
    const digit = BASE64.indexOf(char);
    value += (digit % VLQ_BASE) * scale;
    if (digit >= VLQ_BASE) {
      scale *= VLQ_BASE;
    } else {
      const magnitude = Math.floor(value / 2);
      values.push(value % 2 === 1 ? -magnitude : magnitude);
      value = 0;
      scale = 1;
    }
  }
  return values;
};

interface Segment {
  readonly column: number;
  readonly source: number;
  readonly line: number;
  readonly sourceColumn: number;
  readonly name: number;
}

const segmentsOf = (map: SourceMap): Segment[][] => {
  const state = { line: 0, name: 0, source: 0, sourceColumn: 0 };
  return map.mappings.split(";").map((line) => {
    let column = 0;
    return line
      .split(",")
      .filter((piece) => piece.length > 0)
      .map((piece) => {
        const [dColumn = 0, dSource = 0, dLine = 0, dSourceColumn = 0, dName] =
          decodeVlq(piece);
        column += dColumn;
        state.source += dSource;
        state.line += dLine;
        state.sourceColumn += dSourceColumn;
        if (dName !== undefined) {
          state.name += dName;
        }
        return {
          column,
          line: state.line,
          name: dName === undefined ? -1 : state.name,
          source: state.source,
          sourceColumn: state.sourceColumn,
        };
      });
  });
};

interface LoadedMap {
  readonly map: SourceMap;
  readonly lines: Segment[][];
}

export const loadMap = async (url: string): Promise<LoadedMap | null> => {
  try {
    const response = await fetch(`${url}.map`);
    if (!response.ok) {
      return null;
    }
    const map = Schema.decodeUnknownSync(sourceMap)(await response.json());
    return { lines: segmentsOf(map), map };
  } catch {
    return null;
  }
};

export const originalOf = (
  loaded: LoadedMap,
  line: number,
  column: number
): string | null => {
  const segments = loaded.lines[line] ?? [];
  const found = segments.findLast((segment) => segment.column <= column);
  if (!found) {
    return null;
  }
  const source = (loaded.map.sources[found.source] ?? "?")
    .replace(/^(?:\.\.\/)+/u, "")
    .replace(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//u, "");
  const lines = loaded.map.sourcesContent?.[found.source]?.split("\n") ?? [];
  const text = lines[found.line]?.trim() ?? "";
  const name = loaded.map.names[found.name];
  return `${source}:${found.line + 1}${name !== undefined && name !== "" ? ` ${name}` : ""}  ${text.slice(0, 70)}`;
};
