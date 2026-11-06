import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const entities: Readonly<Record<string, string>> = {
  centerdot: "·",
  mdash: "—",
  middot: "·",
};

const decodeEntities = (text: string): string =>
  text.replaceAll(
    /&(?:#x(?<hex>[\da-f]+)|#(?<decimal>\d+)|(?<name>[a-z]+));/giu,
    (whole, hex?: string, decimal?: string, name?: string) => {
      if (hex !== undefined) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      if (decimal !== undefined) {
        return String.fromCodePoint(Number(decimal));
      }
      return entities[name ?? ""] ?? whole;
    }
  );

const offences = [
  { messageId: "robot", pattern: /\bAI\b/u },
  { messageId: "emDash", pattern: /—/u },
  { messageId: "middot", pattern: /·/u },
] as const;

export const playerCopyRule = defineRule({
  create(context) {
    const check = (node: ESTree.Node, text: string): void => {
      for (const { messageId, pattern } of offences) {
        if (pattern.test(text)) {
          context.report({ messageId, node });
        }
      }
    };
    return {
      JSXText(node) {
        check(node, decodeEntities(node.value));
      },
      Literal(node) {
        if (typeof node.value === "string") {
          check(
            node,
            node.parent.type === "JSXAttribute"
              ? decodeEntities(node.value)
              : node.value
          );
        }
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
  meta: {
    docs: {
      description:
        "Player text never says AI and uses no em dash or middle dot.",
    },
    messages: {
      emDash:
        "Player text uses no em dash. End the sentence or use a comma (docs/coding-standards.md, player copy).",
      middot:
        "Player text uses no middle dot as a separator. Use a comma or plain words (docs/coding-standards.md, player copy).",
      robot:
        "Player text never says AI. The other riders are street riders, and a rider the room rides for looks like anyone else (docs/coding-standards.md, player copy).",
    },
    type: "problem",
  },
});
