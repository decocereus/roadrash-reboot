import { describe, expect, it } from "vitest";

import config from "../oxlint.config.ts";
import { ruleLedger } from "./rule-ledger.ts";

const testFiles =
  "**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx}, **/__tests__/**/*.{ts,tsx,js,jsx}";

describe("Rule ledger", () => {
  it("finds no exemption in the project config", () => {
    expect(ruleLedger(config).exemptions).toStrictEqual([]);
  });

  it("fails a rule turned off in the root rules", () => {
    const ledger = ruleLedger({
      ...config,
      rules: { ...config.rules, "typescript/no-floating-promises": "off" },
    });
    expect(ledger.exemptions).toStrictEqual([
      "`typescript/no-floating-promises` is not error in the root rules",
    ]);
    expect(ledger.enabled.has("typescript/no-floating-promises")).toBeFalsy();
  });

  it("fails a rule turned off for some files", () => {
    const ledger = ruleLedger({
      ...config,
      overrides: [
        ...(config.overrides ?? []),
        { files: ["alchemy.run.ts"], rules: { "rushline/no-comments": "off" } },
      ],
    });
    expect(ledger.exemptions).toStrictEqual([
      "`rushline/no-comments` is not error for alchemy.run.ts",
    ]);
  });

  it("fails a preset override that turns a rule off and stays unrestored", () => {
    expect(ruleLedger({ ...config, overrides: [] }).exemptions).toStrictEqual([
      `\`no-empty-function\` is not error for ${testFiles}`,
      `\`promise/prefer-await-to-then\` is not error for ${testFiles}`,
    ]);
  });
});
