interface Row {
  readonly id: string;
}

const oneRowPerId = <Id extends string, Value>(
  table: Readonly<Record<string, Value>>,
  ids: readonly Id[]
): table is Readonly<Record<Id, Value>> =>
  Object.keys(table).length === ids.length;

export const idsOf = <Each extends Row>([first, ...rest]: readonly [
  Each,
  ...Each[],
]): readonly [Each["id"], ...Each["id"][]] => [
  first.id,
  ...rest.map((row) => row.id),
];

export const byId = <Each extends Row, Value>(
  rows: readonly Each[],
  make: (row: Each) => Value
): Readonly<Record<Each["id"], Value>> => {
  const table = Object.fromEntries(rows.map((row) => [row.id, make(row)]));
  const ids = rows.map((row): Each["id"] => row.id);
  if (!oneRowPerId(table, ids)) {
    throw new Error(`Two rows share an id among ${ids.join(", ")}.`);
  }
  return table;
};
