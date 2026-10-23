import type { ESTree } from "@oxlint/plugins";

export const effectModules: ReadonlySet<string> = new Set([
  "effect",
  "effect/Effect",
]);

export const namespaceNames = (
  node: ESTree.ImportDeclaration,
  modules: ReadonlySet<string>,
  exported: string
): readonly string[] => {
  if (!modules.has(node.source.value)) {
    return [];
  }
  return node.specifiers.flatMap((specifier) => {
    const imported =
      specifier.type === "ImportSpecifier" &&
      specifier.imported.type === "Identifier"
        ? specifier.imported.name
        : null;
    return specifier.type === "ImportNamespaceSpecifier" ||
      (node.source.value === "effect" && imported === exported)
      ? [specifier.local.name]
      : [];
  });
};
