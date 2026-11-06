export interface RuleRoute {
  readonly design: readonly string[];
  readonly paths: readonly string[];
  readonly rules: readonly string[];
}

const routeHeader = /^\|\s*Paths\s*\|\s*Rules\s*\|\s*Design\s*\|$/u;
const ruleHeader =
  /^\|\s*Rule\s*\|\s*Check\s*\|\s*Scope\s*\|\s*Exemption\s*\|$/u;
const divider = /^\|(?:\s*-+\s*\|)+$/u;
const quoted = /`(?<text>[^`]+)`/gu;

const tableRows = (text: string, header: RegExp): string[][] => {
  const rows: string[][] = [];
  let inTable = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (header.test(line)) {
      inTable = true;
      continue;
    }
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    if (inTable && !divider.test(line)) {
      rows.push(line.split("|").slice(1, -1));
    }
  }
  return rows;
};

const quotedIn = (cell: string): string[] =>
  [...cell.matchAll(quoted)].flatMap((match) =>
    match.groups?.text === undefined ? [] : [match.groups.text]
  );

export const routesIn = (text: string): RuleRoute[] =>
  tableRows(text, routeHeader).map(([paths = "", rules = "", design = ""]) => ({
    design: quotedIn(design),
    paths: quotedIn(paths),
    rules: quotedIn(rules),
  }));

export const ruleChecksIn = (text: string): string[] =>
  tableRows(text, ruleHeader).map(([, check = ""]) => check.trim());

export const routedRuleDocs = (routes: readonly RuleRoute[]): string[] => [
  ...new Set(routes.flatMap((route) => route.rules)),
];
