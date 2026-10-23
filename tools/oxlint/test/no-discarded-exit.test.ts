import { readFileSync } from "node:fs";

import { noDiscardedExitRule } from "../rushline/rules/no-discarded-exit.ts";
import { runRule } from "./cases.ts";

const discarded = [{ messageId: "discarded" }];

const policeBeforeExitCheck = readFileSync(
  new URL("fixtures/police-test-before-exit-check.txt", import.meta.url),
  "utf-8"
);

runRule("rushline/no-discarded-exit", noDiscardedExitRule, {
  invalid: [
    {
      code: policeBeforeExitCheck,
      errors: discarded,
      filename: "packages/career/src/police.test.ts",
    },
    {
      code: "import { once } from 'node:events'; await once(worker, 'exit');",
      errors: discarded,
    },
    {
      code: "import { once } from 'node:events'; void once(worker, 'exit');",
      errors: discarded,
    },
    {
      code: "import { once } from 'node:events'; void (await once(worker, 'exit'));",
      errors: discarded,
    },
    {
      code: "import { once } from 'node:events'; once(child, `exit`);",
      errors: discarded,
    },
    {
      code: "import { once as exited } from 'node:events'; const run = async () => { await exited(child, 'exit'); };",
      errors: discarded,
    },
    {
      code: "import * as events from 'node:events'; await events.once(worker, 'exit');",
      errors: discarded,
    },
    {
      code: "import events from 'node:events'; void events['once'](worker, 'exit');",
      errors: discarded,
    },
  ],
  valid: [
    "import { once } from 'node:events'; const exit: unknown[] = await once(worker, 'exit'); const [code] = exit; if (code !== 0) { throw new Error(String(code)); }",
    "import { once as exited } from 'node:events'; const [code] = await exited(worker, 'exit');",
    "import * as events from 'node:events'; const [code] = await events.once(worker, 'exit');",
    "import { once } from 'node:events'; const stop = async (once) => { await once(worker, 'exit'); };",
    "import { once } from 'node:events'; const stop = async () => { const once = wait; await once(worker, 'exit'); };",
    "import { once } from 'node:events'; await once(worker, 'online'); await once(server, 'listening');",
    "import { once } from 'node:events'; await once(worker, event);",
    "import { on as once } from 'node:events'; await once(worker, 'exit');",
    "import { once } from './once.ts'; await once(worker, 'exit');",
    "await once(worker, 'exit');",
    "import * as events from 'node:events'; await events.on(worker, 'exit');",
    "import { once } from 'node:events'; export const exited = once(worker, 'exit');",
  ],
});
