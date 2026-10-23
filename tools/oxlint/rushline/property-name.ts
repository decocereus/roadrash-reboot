import type { ESTree } from "@oxlint/plugins";

const quoted = /^(?<quote>["'`])(?<text>[^"'`]*)\k<quote>$/u;

export const literalText = (node: ESTree.Node, raw: string): string | null =>
  node.type === "Literal" || node.type === "TemplateLiteral"
    ? (quoted.exec(raw)?.groups?.text ?? null)
    : null;

export const memberName = (
  node: ESTree.MemberExpression,
  raw: (node: ESTree.Node) => string
): string | null => {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : null;
  }
  return literalText(node.property, raw(node.property));
};

export const moduleName = (node: ESTree.ModuleExportName): string =>
  node.type === "Identifier" ? node.name : node.value;
