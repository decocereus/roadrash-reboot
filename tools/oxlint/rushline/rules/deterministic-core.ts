import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

const decodeOptions = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.Struct({ core: Schema.Array(Schema.String) })])
);

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
      name: Schema.optionalKey(Schema.String),
    })
  )
);

const workspacePackage = /^@racer\/(?<name>[^/]+)\/(?<entry>.+)$/u;

const ambient = new Set([
  "AbortController",
  "AudioContext",
  "Blob",
  "BroadcastChannel",
  "Buffer",
  "Crypto",
  "Date",
  "Document",
  "Element",
  "Event",
  "EventSource",
  "File",
  "FileReader",
  "Function",
  "Gamepad",
  "HTMLCanvasElement",
  "HTMLElement",
  "Headers",
  "Image",
  "ImageData",
  "KeyboardEvent",
  "Location",
  "MessageChannel",
  "Navigator",
  "NodeJS",
  "OffscreenCanvas",
  "Performance",
  "Request",
  "Response",
  "SharedWorker",
  "Storage",
  "WebGL2RenderingContext",
  "WebGLRenderingContext",
  "WebSocket",
  "Window",
  "Worker",
  "XMLHttpRequest",
  "cancelAnimationFrame",
  "cancelIdleCallback",
  "clearImmediate",
  "clearInterval",
  "clearTimeout",
  "crypto",
  "document",
  "eval",
  "fetch",
  "global",
  "globalThis",
  "localStorage",
  "location",
  "navigator",
  "performance",
  "process",
  "queueMicrotask",
  "require",
  "requestAnimationFrame",
  "requestIdleCallback",
  "self",
  "sessionStorage",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "structuredClone",
  "window",
]);

const slashed = (file: string): string => file.split(path.sep).join("/");

const supportedExports = (exports: Readonly<Record<string, string>>) =>
  Object.keys(exports).length === 1 && exports["./*"] === "./src/*.ts";

const staticKey = (node: ESTree.MemberExpression): string | null => {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return node.property.type === "Literal" &&
    Predicate.isString(node.property.value)
    ? node.property.value
    : null;
};

export const deterministicCoreRule = defineRule({
  create(context) {
    const [{ core }] = decodeOptions(context.options);
    const members = new Set(core);
    const relative = (file: string) =>
      slashed(path.relative(context.cwd, file));

    const resolve = (source: string): string | null => {
      if (source.startsWith(".")) {
        return path.resolve(path.dirname(context.filename), source);
      }
      const parts = workspacePackage.exec(source)?.groups;
      const name = parts?.name ?? "";
      const entry = parts?.entry ?? "";
      if (name === "" || entry === "") {
        return null;
      }
      const dir = path.join(context.cwd, "packages", name);
      const manifestPath = path.join(dir, "package.json");
      if (!existsSync(manifestPath)) {
        return null;
      }
      const manifest = decodeManifest(readFileSync(manifestPath, "utf-8"));
      if (
        manifest.name !== `@racer/${name}` ||
        !manifest.exports ||
        !supportedExports(manifest.exports)
      ) {
        return null;
      }
      return path.join(dir, "src", `${entry}.ts`);
    };

    const checkEdge = (node: ESTree.Node, source: string) => {
      if (!source.startsWith(".") && !source.startsWith("@racer/")) {
        context.report({ data: { source }, messageId: "outward", node });
        return;
      }
      const target = resolve(source);
      if (target === null || !existsSync(target)) {
        context.report({ data: { source }, messageId: "unresolved", node });
        return;
      }
      if (!members.has(relative(target))) {
        context.report({
          data: { source, target: relative(target) },
          messageId: "outsideCore",
          node,
        });
      }
    };

    const checkMath = (identifier: ESTree.Node) => {
      const { parent } = identifier;
      if (parent?.type !== "MemberExpression" || parent.object !== identifier) {
        context.report({ messageId: "mathEscape", node: identifier });
        return;
      }
      const key = staticKey(parent);
      if (key === null) {
        context.report({ messageId: "mathEscape", node: parent });
      } else if (key === "random") {
        context.report({ messageId: "mathRandom", node: parent });
      }
    };

    return {
      ExportAllDeclaration(node) {
        checkEdge(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) {
          checkEdge(node, node.source.value);
        }
      },
      ImportDeclaration(node) {
        checkEdge(node, node.source.value);
      },
      ImportExpression(node) {
        context.report({ messageId: "dynamicImport", node });
      },
      MetaProperty(node) {
        if (node.meta.name === "import") {
          context.report({ messageId: "importMeta", node });
        }
      },
      "Program:exit"() {
        const scope = context.sourceCode.scopeManager.globalScope;
        const declaredGlobals = (scope?.variables ?? []).filter(
          (variable) => variable.defs.length === 0
        );
        for (const reference of [
          ...(scope?.through ?? []),
          ...declaredGlobals.flatMap((variable) => variable.references),
        ]) {
          const { identifier } = reference;
          if (identifier.type !== "Identifier") {
            continue;
          }
          if (identifier.name === "Math") {
            checkMath(identifier);
          } else if (ambient.has(identifier.name)) {
            context.report({
              data: { name: identifier.name },
              messageId: "ambient",
              node: identifier,
            });
          }
        }
      },
      TSExternalModuleReference(node) {
        context.report({ messageId: "importEquals", node });
      },
      TSImportType(node) {
        checkEdge(node, node.source.value);
      },
    };
  },
  meta: {
    docs: {
      description:
        "Keep the simulation, track and career rules deterministic: they import only other deterministic modules and reach no clock, entropy, host or loader.",
    },
    messages: {
      ambient:
        "`{{name}}` reaches outside the race. Deterministic modules get time, randomness and host state only as arguments.",
      dynamicImport:
        "Deterministic modules load nothing at run time. Import the module statically.",
      importEquals:
        "`import = require` loads a module outside the deterministic graph. Use a static import of a deterministic module.",
      importMeta:
        "`import.meta` reads the host. Deterministic modules take what they need as arguments.",
      mathEscape:
        "Use Math only as `Math.name(...)`. Passing, aliasing or indexing Math with a computed key lets `Math.random` escape this check.",
      mathRandom:
        "`Math.random` is unseeded. Draw from the seeded generator in `@racer/track/random`.",
      outsideCore:
        "`{{source}}` resolves to {{target}}, which is not a deterministic module. Core modules import only the sim, track and career rule modules listed in oxlint.config.ts.",
      outward:
        "`{{source}}` is outside the deterministic core. Core modules import only other sim, track and career rule modules.",
      unresolved:
        "`{{source}}` does not resolve to a module file. Core imports name an existing `.ts` module by relative path or `@racer/<package>/<module>`.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: { core: { items: { type: "string" }, type: "array" } },
        required: ["core"],
        type: "object",
      },
    ],
    type: "problem",
  },
});
