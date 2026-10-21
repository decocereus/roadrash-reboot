import { fileURLToPath } from "node:url";

import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

RuleTester.describe = (text, fn) => {
  describe(text, fn);
};
RuleTester.it = it;
RuleTester.setDefaultConfig({
  cwd: fileURLToPath(new URL("../../..", import.meta.url)),
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
});
