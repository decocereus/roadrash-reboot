import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import * as Schema from "effect/Schema";
import {
  BuildEnvironment,
  createIdResolver,
  parseSync,
  resolveConfig,
  Visitor,
} from "vite";

import { hasCode } from "./node-error.ts";

type EdgeKind = "import" | "require";

export interface ImportPorts {
  readonly read: (file: string) => string;
  readonly resolve: (
    specifier: string,
    importer: string,
    kind: EdgeKind
  ) => Promise<string | null>;
  readonly owner: (file: string) => string | null;
  readonly real: (file: string) => string;
}

interface Step {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
}

type Forbidden = "game" | "three";

export type Finding =
  | {
      readonly kind: "forbidden";
      readonly chain: readonly Step[];
      readonly target: string;
      readonly owner: Forbidden;
    }
  | { readonly kind: "unresolved"; readonly chain: readonly Step[] }
  | { readonly kind: "opaque-lazy"; readonly chain: readonly Step[] }
  | {
      readonly kind: "unparsed";
      readonly file: string;
      readonly message: string;
    };

interface Edge {
  readonly specifier: string;
  readonly start: number;
  readonly kind: EdgeKind;
}

interface Visit {
  readonly id: string;
  readonly via: readonly Step[];
}

const scripts = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const literal = /^(?:"[^"]*"|'[^']*'|`[^`$]*`)$/u;

const lineAt = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

const valueEdges = (file: string, text: string) => {
  const parsed = parseSync(file, text);
  const [error] = parsed.errors;
  const edges: Edge[] = [];
  const opaque: number[] = [];
  for (const statement of parsed.module.staticImports) {
    if (
      statement.entries.length === 0 ||
      statement.entries.some((entry) => !entry.isType)
    ) {
      edges.push({
        kind: "import",
        specifier: statement.moduleRequest.value,
        start: statement.start,
      });
    }
  }
  for (const statement of parsed.module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest !== null && !entry.isType) {
        edges.push({
          kind: "import",
          specifier: entry.moduleRequest.value,
          start: statement.start,
        });
      }
    }
  }
  for (const lazy of parsed.module.dynamicImports) {
    const request = text.slice(
      lazy.moduleRequest.start,
      lazy.moduleRequest.end
    );
    if (!literal.test(request)) {
      opaque.push(lazy.start);
    }
  }
  if (!parsed.module.hasModuleSyntax) {
    new Visitor({
      CallExpression(call) {
        const [first] = call.arguments;
        const request = first ? text.slice(first.start, first.end) : "";
        if (
          call.callee.type === "Identifier" &&
          call.callee.name === "require" &&
          literal.test(request)
        ) {
          edges.push({
            kind: "require",
            specifier: request.slice(1, -1),
            start: call.start,
          });
        }
      },
    }).visit(parsed.program);
  }
  return { edges, error: error?.message ?? null, opaque };
};

const inside = (directory: string, file: string): boolean => {
  const relative = path.relative(directory, file);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
};

const split = (id: string) => {
  const at = id.indexOf("?");
  return at === -1
    ? { file: id, query: "" }
    : { file: id.slice(0, at), query: id.slice(at) };
};

export const walkImports = async (
  roots: readonly string[],
  ports: ImportPorts,
  gameDirectory: string
): Promise<Finding[]> => {
  const game = ports.real(gameDirectory);
  const seen = new Set<string>();
  const findings: Finding[] = [];

  const ownerOf = (file: string): Forbidden | null => {
    if (inside(game, file)) {
      return "game";
    }
    return ports.owner(file) === "three" ? "three" : null;
  };

  const expand = async (visit: Visit, file: string): Promise<Visit[]> => {
    const text = ports.read(file);
    const { edges, error, opaque } = valueEdges(file, text);
    if (error !== null) {
      findings.push({ file, kind: "unparsed", message: error });
      return [];
    }
    for (const start of opaque) {
      findings.push({
        chain: [
          ...visit.via,
          { file, line: lineAt(text, start), specifier: "import(…)" },
        ],
        kind: "opaque-lazy",
      });
    }
    const resolved = await Promise.all(
      edges.map(async (edge) => ({
        id: await ports.resolve(edge.specifier, file, edge.kind),
        step: {
          file,
          line: lineAt(text, edge.start),
          specifier: edge.specifier,
        },
      }))
    );
    const next: Visit[] = [];
    for (const { id, step } of resolved) {
      if (id === null) {
        findings.push({ chain: [...visit.via, step], kind: "unresolved" });
      } else {
        next.push({ id, via: [...visit.via, step] });
      }
    }
    return next;
  };

  const enter = async (visit: Visit): Promise<Visit[]> => {
    const { file: raw, query } = split(visit.id);
    const file = ports.real(raw);
    const key = `${file}${query}`;
    const owner = ownerOf(file);
    if (owner !== null) {
      findings.push({
        chain: visit.via,
        kind: "forbidden",
        owner,
        target: key,
      });
      return [];
    }
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    if (query !== "" || !scripts.test(file)) {
      return [];
    }
    return await expand(visit, file);
  };

  const level = async (visits: readonly Visit[]): Promise<void> => {
    const entered = await Promise.all(visits.map(enter));
    const next = entered.flat();
    if (next.length > 0) {
      await level(next);
    }
  };

  await level(roots.map((id) => ({ id, via: [] })));
  return findings;
};

const ownerNames = {
  game: "game implementation under apps/web/src/game",
  three: "the three package",
} as const;

export const describeFinding = (finding: Finding, base: string): string => {
  const shown = (file: string) => path.relative(base, file);
  if (finding.kind === "unparsed") {
    return `${shown(finding.file)} does not parse: ${finding.message}`;
  }
  const chain = finding.chain.map(
    (step) => `  ${shown(step.file)}:${step.line} imports "${step.specifier}"`
  );
  if (finding.kind === "forbidden") {
    return [
      `React reaches ${ownerNames[finding.owner]} through a static value import:`,
      ...chain,
      `  -> ${shown(finding.target)}`,
      "Import its types with `import type`, or load it through the literal dynamic import in apps/web/src/asset-load.ts.",
    ].join("\n");
  }
  if (finding.kind === "opaque-lazy") {
    return [
      "A dynamic import with a computed specifier hides which module it loads:",
      ...chain,
      "Use a string literal so the check knows where the static graph stops.",
    ].join("\n");
  }
  return [
    "An import does not resolve, so the check cannot see what it loads:",
    ...chain,
  ].join("\n");
};

const read = (file: string) => readFileSync(file, "utf-8");

const decodePackage = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ name: Schema.optional(Schema.String) }))
);

const packageOwners = () => {
  const names = new Map<string, string | null>();
  const nameAt = (directory: string): string | null => {
    const known = names.get(directory);
    if (known !== undefined) {
      return known;
    }
    let name: string | null = null;
    try {
      name =
        decodePackage(read(path.join(directory, "package.json"))).name ?? null;
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        throw error;
      }
    }
    const parent = path.dirname(directory);
    const found = name ?? (parent === directory ? null : nameAt(parent));
    names.set(directory, found);
    return found;
  };
  return (file: string) => nameAt(path.dirname(file));
};

export const viteImportPorts = async (
  root: string,
  configFile: string | false
): Promise<ImportPorts> => {
  const config = await resolveConfig(
    { configFile, logLevel: "silent", root },
    "build",
    "production",
    "production"
  );
  const client = new BuildEnvironment("client", config);
  const resolvers = {
    import: createIdResolver(config, {}),
    require: createIdResolver(config, { isRequire: true }),
  };
  return {
    owner: packageOwners(),
    read,
    real: realpathSync,
    async resolve(specifier, importer, kind) {
      const id = await resolvers[kind](client, specifier, importer);
      return id !== undefined && path.isAbsolute(split(id).file) ? id : null;
    },
  };
};
