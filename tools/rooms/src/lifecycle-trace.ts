type Value =
  | { readonly kind: "atom"; readonly text: string }
  | {
      readonly kind: "list";
      readonly items: readonly Value[];
      readonly open: "<<" | "{";
    }
  | {
      readonly kind: "record";
      readonly fields: readonly (readonly [string, Value])[];
    }
  | {
      readonly kind: "map";
      readonly pairs: readonly (readonly [string, Value])[];
    };

interface Step {
  readonly action: string;
  readonly changes: readonly string[];
  readonly state: number;
}

const TOKEN =
  /\s*(?<token><<|>>|\|->|:>|@@|"[^"]*"|-?\d+|[A-Za-z_]\w*|[[\](){},])/uy;

const tokensOf = (source: string): readonly string[] => {
  const found: string[] = [];
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(source); match; match = TOKEN.exec(source)) {
    found.push(match.groups?.token ?? "");
  }
  return found;
};

const CLOSE = { "<<": ">>", "{": "}" } as const;

const shown = (value: Value): string => {
  switch (value.kind) {
    case "atom": {
      return value.text;
    }
    case "list": {
      return `${value.open}${value.items.map(shown).join(", ")}${CLOSE[value.open]}`;
    }
    case "record": {
      return `[${value.fields.map(([name, each]) => `${name}: ${shown(each)}`).join(", ")}]`;
    }
    case "map": {
      return `(${value.pairs.map(([key, each]) => `${key}: ${shown(each)}`).join(", ")})`;
    }
    default: {
      return value satisfies never;
    }
  }
};

const parse = (
  tokens: readonly string[],
  at: number
): readonly [Value, number] => {
  const head = tokens[at] ?? "";
  if (head === "[") {
    const fields: (readonly [string, Value])[] = [];
    let next = at + 1;
    while (next < tokens.length && tokens[next] !== "]") {
      const [value, after] = parse(tokens, next + 2);
      fields.push([tokens[next] ?? "", value]);
      next = tokens[after] === "," ? after + 1 : after;
    }
    return [{ fields, kind: "record" }, next + 1];
  }
  if (head === "(") {
    const pairs: (readonly [string, Value])[] = [];
    let next = at + 1;
    while (next < tokens.length && tokens[next] !== ")") {
      const [key, afterKey] = parse(tokens, next);
      const [value, after] = parse(tokens, afterKey + 1);
      pairs.push([shown(key), value]);
      next = tokens[after] === "@@" ? after + 1 : after;
    }
    return [{ kind: "map", pairs }, next + 1];
  }
  if (head === "<<" || head === "{") {
    const items: Value[] = [];
    let next = at + 1;
    while (next < tokens.length && tokens[next] !== CLOSE[head]) {
      const [value, after] = parse(tokens, next);
      items.push(value);
      next = tokens[after] === "," ? after + 1 : after;
    }
    return [{ items, kind: "list", open: head }, next + 1];
  }
  return [{ kind: "atom", text: head }, at + 1];
};

const flatten = (value: Value, at: string, into: Map<string, string>): void => {
  switch (value.kind) {
    case "record": {
      for (const [name, each] of value.fields) {
        flatten(each, `${at}.${name}`, into);
      }
      return;
    }
    case "map": {
      for (const [key, each] of value.pairs) {
        flatten(each, `${at}[${key}]`, into);
      }
      return;
    }
    case "atom":
    case "list": {
      into.set(at, shown(value));
      return;
    }
    default: {
      value satisfies never;
    }
  }
};

const VARIABLE = /^\/\\ (?<name>\w+) = /mu;

const fieldsOf = (body: string): Map<string, string> => {
  const fields = new Map<string, string>();
  const parts = body.split(/^(?=\/\\ \w+ = )/mu);
  for (const part of parts) {
    const name = VARIABLE.exec(part)?.groups?.name;
    if (name !== undefined) {
      const [value] = parse(tokensOf(part.replace(VARIABLE, "")), 0);
      flatten(value, name, fields);
    }
  }
  return fields;
};

const STATE = /^State (?<state>\d+): (?<header>.*)$/u;

export const traceOf = (output: string): readonly Step[] => {
  const steps: Step[] = [];
  let seen = new Map<string, string>();
  const lines = output.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const found = STATE.exec(lines[index] ?? "")?.groups;
    if (found) {
      const body: string[] = [];
      for (let next = index + 1; (lines[next] ?? "").trim() !== ""; next += 1) {
        body.push(lines[next] ?? "");
      }
      const before = seen;
      const now = new Map([...before, ...fieldsOf(body.join("\n"))]);
      steps.push({
        action: (found.header ?? "")
          .replaceAll(/^<|>$/gu, "")
          .replace(/ line .*$/u, ""),
        changes:
          steps.length === 0
            ? []
            : [...now]
                .filter(([at, text]) => before.get(at) !== text)
                .map(([at, text]) => `${at} = ${text}`),
        state: Number(found.state),
      });
      seen = now;
    }
  }
  return steps;
};

export const traceText = (output: string): string => {
  const loop = /^Back to state (?<state>\d+)/mu.exec(output)?.groups?.state;
  return [
    ...traceOf(output).flatMap(({ action, changes, state }) => [
      `${state}: ${action}`,
      ...changes.map((change) => `     ${change}`),
    ]),
    ...(loop === undefined ? [] : [`then back to state ${loop}, for ever`]),
  ].join("\n");
};
