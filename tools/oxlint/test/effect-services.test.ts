import { noServiceConstructorImportsRule } from "../rushline/rules/no-service-constructor-imports.ts";
import { runRule } from "./cases.ts";

const constructorImport = (name: string) => [
  { data: { name }, messageId: "serviceConstructorImport" },
];

runRule(
  "rushline/no-service-constructor-imports",
  noServiceConstructorImportsRule,
  {
    invalid: [
      {
        code: "import { makeLedger } from './ledger.ts';",
        errors: constructorImport("makeLedger"),
      },
      {
        code: "import { makeBrowser } from '@racer/devtools/chrome';",
        errors: constructorImport("makeBrowser"),
      },
      {
        code: "import { makeSlots as slots } from '../state.ts';",
        errors: constructorImport("makeSlots"),
      },
      {
        code: "import { makeLedger } from './ledger.ts';",
        errors: constructorImport("makeLedger"),
        filename: "ledger.test.ts",
      },
    ],
    valid: [
      "import { make } from './ledger.ts';",
      "import { makeTempDirectory } from 'effect/FileSystem';",
      "import { Ledger } from '@racer/devtools/ledger';",
      "import * as makeLedger from './ledger.ts';",
    ],
  }
);
