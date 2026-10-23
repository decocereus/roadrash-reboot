import type { Rule } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";

type Cases = Parameters<RuleTester["run"]>[2];

const tester = new RuleTester();

export const runRule = (name: string, rule: Rule, cases: Cases) => {
  if (cases.valid.length === 0 || cases.invalid.length === 0) {
    throw new Error(`${name} needs at least one valid and one invalid case.`);
  }
  tester.run(name, rule, cases);
};
