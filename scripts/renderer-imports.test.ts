import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  describeFinding,
  viteImportPorts,
  walkImports,
} from "./renderer-imports.ts";
import type { Finding, ImportPorts } from "./renderer-imports.ts";

const root = "/repo/src/root.tsx";
const game = "/repo/src/game";
const engine = "/repo/src/game/engine.ts";
const three = "/repo/node_modules/three";

const packages = new Map([
  ["three", `${three}/build/three.module.js`],
  [
    "three/addons/loaders/GLTFLoader.js",
    `${three}/examples/jsm/loaders/GLTFLoader.js`,
  ],
]);

const graph = (files: Readonly<Record<string, string>>): ImportPorts => {
  const all = new Map([
    [`${three}/build/three.module.js`, "export const Mesh = 1;"],
    [
      `${three}/examples/jsm/loaders/GLTFLoader.js`,
      'import { Mesh } from "three";\nexport const GLTFLoader = Mesh;',
    ],
    [engine, "export const createGame = () => 1;\nexport type Game = 1;"],
    ...Object.entries(files),
  ]);
  const exists = (id: string) => all.has(id.split("?")[0] ?? "");
  return {
    owner: (file) => (file.startsWith(`${three}/`) ? "three" : "@racer/web"),
    read: (file) => {
      const text = all.get(file);
      if (text === undefined) {
        throw new Error(`The fixture has no ${file}.`);
      }
      return text;
    },
    real: (file) => file,
    async resolve(specifier, importer) {
      await nextTurn();
      const target = specifier.startsWith(".")
        ? path.posix.resolve(path.posix.dirname(importer), specifier)
        : packages.get(specifier);
      return target !== undefined && exists(target) ? target : null;
    },
  };
};

const findingsOf = async (
  files: Readonly<Record<string, string>>,
  roots: readonly string[] = [root]
): Promise<Finding[]> => await walkImports(roots, graph(files), game);

const reported = (findings: readonly Finding[]) =>
  findings.map((finding) => describeFinding(finding, "/repo"));

describe("check:renderer-imports finds every static value path into the game or three", () => {
  it("fails a direct value import of the game", async () => {
    const findings = await findingsOf({
      [root]:
        'import { createGame } from "./game/engine.ts";\nexport const run = createGame;',
    });
    expect(reported(findings)).toStrictEqual([
      [
        "React reaches game implementation under apps/web/src/game through a static value import:",
        '  src/root.tsx:1 imports "./game/engine.ts"',
        "  -> src/game/engine.ts",
        "Import its types with `import type`, or load it through the literal dynamic import in apps/web/src/asset-load.ts.",
      ].join("\n"),
    ]);
  });

  it("prints the whole chain through a helper", async () => {
    const findings = await findingsOf({
      "/repo/src/helper.ts":
        'export const ready = true;\n\nimport { createGame } from "./game/engine.ts";\nexport const run = createGame;',
      [root]: 'import { run } from "./helper.ts";\nexport const go = run;',
    });
    expect(findings).toStrictEqual([
      {
        chain: [
          { file: root, line: 1, specifier: "./helper.ts" },
          {
            file: "/repo/src/helper.ts",
            line: 3,
            specifier: "./game/engine.ts",
          },
        ],
        kind: "forbidden",
        owner: "game",
        target: engine,
      },
    ]);
  });

  it.each([
    ["a neutral re-export", 'export { createGame } from "./game/engine.ts";'],
    ["a star re-export", 'export * from "./game/engine.ts";'],
    ["a side-effect import", 'import "./game/engine.ts";'],
    [
      "a mixed type and value import",
      'import { type Game, createGame } from "./game/engine.ts";\nexport const run: Game = createGame();',
    ],
  ])("fails %s that passes through a neutral module", async (_, neutral) => {
    const findings = await findingsOf({
      "/repo/src/neutral.ts": neutral,
      [root]: 'import "./neutral.ts";',
    });
    expect(findings).toStrictEqual([
      {
        chain: [
          { file: root, line: 1, specifier: "./neutral.ts" },
          {
            file: "/repo/src/neutral.ts",
            line: 1,
            specifier: "./game/engine.ts",
          },
        ],
        kind: "forbidden",
        owner: "game",
        target: engine,
      },
    ]);
  });

  it("fails a three addon by the package that owns it", async () => {
    const findings = await findingsOf({
      [root]:
        'import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";\nexport const loader = GLTFLoader;',
    });
    expect(findings).toStrictEqual([
      {
        chain: [
          {
            file: root,
            line: 1,
            specifier: "three/addons/loaders/GLTFLoader.js",
          },
        ],
        kind: "forbidden",
        owner: "three",
        target: `${three}/examples/jsm/loaders/GLTFLoader.js`,
      },
    ]);
  });

  it("follows a cycle once and still reaches the offender behind it", async () => {
    const findings = await findingsOf({
      "/repo/src/a.ts": 'import { b } from "./b.ts";\nexport const a = b;',
      "/repo/src/b.ts":
        'import { a } from "./a.ts";\nimport { createGame } from "./game/engine.ts";\nexport const b = [a, createGame];',
      [root]: 'import { a } from "./a.ts";\nexport const go = a;',
    });
    expect(findings).toStrictEqual([
      {
        chain: [
          { file: root, line: 1, specifier: "./a.ts" },
          { file: "/repo/src/a.ts", line: 1, specifier: "./b.ts" },
          { file: "/repo/src/b.ts", line: 2, specifier: "./game/engine.ts" },
        ],
        kind: "forbidden",
        owner: "game",
        target: engine,
      },
    ]);
  });

  it("fails a static import that replaces the bridge's dynamic import", async () => {
    const bridge = "/repo/src/asset-load.ts";
    const flow = "/repo/src/components/use-flow.ts";
    const files = {
      [flow]:
        'import { bootGame } from "../asset-load.ts";\nexport const boot = bootGame;',
      [root]:
        'import { boot } from "./components/use-flow.ts";\nexport const go = boot;',
    };
    await expect(
      findingsOf({
        ...files,
        [bridge]:
          'export const bootGame = async () => await import("./game/engine.ts");',
      })
    ).resolves.toStrictEqual([]);
    await expect(
      findingsOf({
        ...files,
        [bridge]:
          'import { createGame } from "./game/engine.ts";\nexport const bootGame = createGame;',
      })
    ).resolves.toStrictEqual([
      {
        chain: [
          { file: root, line: 1, specifier: "./components/use-flow.ts" },
          { file: flow, line: 1, specifier: "../asset-load.ts" },
          { file: bridge, line: 1, specifier: "./game/engine.ts" },
        ],
        kind: "forbidden",
        owner: "game",
        target: engine,
      },
    ]);
  });

  it("fails a CommonJS require of three and an asset URL inside the game", async () => {
    const findings = await findingsOf({
      "/repo/src/legacy.js":
        'const three = require("three");\nmodule.exports = three;',
      [root]:
        'import "./legacy.js";\nimport bike from "./game/models/bike.glb?url";\nexport const url = bike;',
      [`${game}/models/bike.glb`]: "",
    });
    expect(findings).toHaveLength(2);
    expect(findings).toContainEqual({
      chain: [
        { file: root, line: 1, specifier: "./legacy.js" },
        { file: "/repo/src/legacy.js", line: 1, specifier: "three" },
      ],
      kind: "forbidden",
      owner: "three",
      target: `${three}/build/three.module.js`,
    });
    expect(findings).toContainEqual({
      chain: [{ file: root, line: 2, specifier: "./game/models/bike.glb?url" }],
      kind: "forbidden",
      owner: "game",
      target: `${game}/models/bike.glb?url`,
    });
  });

  it("reports an import it cannot resolve and a computed dynamic import", async () => {
    const findings = await findingsOf({
      [root]:
        'import { gone } from "./gone.ts";\nconst name = "./game/engine.ts";\nexport const load = async () => [gone, await import(name)];',
    });
    expect(findings.map((finding) => finding.kind).toSorted()).toStrictEqual([
      "opaque-lazy",
      "unresolved",
    ]);
  });
});

describe("check:renderer-imports allows types and lazy boundaries", () => {
  it("passes type-only imports, all-type re-exports, literal lazy imports and CSS URLs", async () => {
    const findings = await findingsOf({
      "/repo/src/contracts.ts": [
        'export type { Game } from "./game/engine.ts";',
        'export type * from "three";',
        'export { type Game as Played } from "./game/engine.ts";',
      ].join("\n"),
      "/repo/src/styles.css": "",
      [root]: [
        'import type { Game } from "./game/engine.ts";',
        'import { type Mesh } from "three";',
        'import type { Played } from "./contracts.ts";',
        'import "./contracts.ts";',
        'import styles from "./styles.css?url";',
        "export const lazy = async () => await import(`./game/engine.ts`);",
        "export type Seen = Game | Mesh | Played;",
        "export const css = styles;",
      ].join("\n"),
    });
    expect(findings).toStrictEqual([]);
  });
});

const write = (directory: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), text);
};

describe("check:renderer-imports with the real Vite resolver", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("resolves extensionless paths and package exports before it judges ownership", async () => {
    const directory = realpathSync(
      mkdtempSync(path.join(tmpdir(), "rushline-renderer-imports-"))
    );
    directories.push(directory);
    write(directory, "package.json", '{ "name": "fixture", "type": "module" }');
    mkdirSync(path.join(directory, "node_modules"));
    const installed = realpathSync(
      path.join(import.meta.dirname, "../apps/web/node_modules/three")
    );
    symlinkSync(installed, path.join(directory, "node_modules/three"));
    write(
      directory,
      "src/root.tsx",
      'import { loader } from "./bridge";\nimport type { Game } from "./game/engine";\nexport const lazy = async () => await import("./game/engine");\nexport const shown: Game | typeof loader = 1;'
    );
    write(
      directory,
      "src/bridge.ts",
      'import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";\nexport const loader = GLTFLoader;'
    );
    write(directory, "src/game/engine.ts", "export type Game = 1;");
    const ports = await viteImportPorts(directory, false);
    const findings = await walkImports(
      [path.join(directory, "src/root.tsx")],
      ports,
      path.join(directory, "src/game")
    );
    expect(findings).toStrictEqual([
      {
        chain: [
          {
            file: path.join(directory, "src/root.tsx"),
            line: 1,
            specifier: "./bridge",
          },
          {
            file: path.join(directory, "src/bridge.ts"),
            line: 1,
            specifier: "three/addons/loaders/GLTFLoader.js",
          },
        ],
        kind: "forbidden",
        owner: "three",
        target: path.join(installed, "examples/jsm/loaders/GLTFLoader.js"),
      },
    ]);
  });

  it("checks the repository from another working directory", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(import.meta.dirname, "check-renderer-imports.ts")],
      { cwd: tmpdir(), encoding: "utf-8" }
    );
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/^Renderer imports: ok \(\d+ React roots/u);
    expect(result.status).toBe(0);
  });
});
