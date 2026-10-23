import { defineRule } from "@oxlint/plugins";

import { moduleName } from "../property-name.ts";

const serviceConstructorName = /^make[A-Z]/u;

const isProjectImport = (source: string) =>
  source.startsWith("./") ||
  source.startsWith("../") ||
  source.startsWith("@racer/");

export const noServiceConstructorImportsRule = defineRule({
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        if (!isProjectImport(node.source.value)) {
          return;
        }
        for (const specifier of node.specifiers) {
          const name =
            specifier.type === "ImportSpecifier"
              ? moduleName(specifier.imported)
              : "";
          if (serviceConstructorName.test(name)) {
            context.report({
              data: { name },
              messageId: "serviceConstructorImport",
              node: specifier,
            });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow importing a project make<Capability> constructor from a relative path or an @racer/ workspace.",
    },
    messages: {
      serviceConstructorImport:
        'Do not import the service constructor "{{name}}". Import the owning service tag or Layer, yield the service, and let its requirements reach the entry point that provides them.',
    },
    type: "problem",
  },
});
