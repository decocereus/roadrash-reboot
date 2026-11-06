import { playerCopyRule } from "../rushline/rules/player-copy.ts";
import { runRule } from "./cases.ts";

runRule("rushline/player-copy", playerCopyRule, {
  invalid: [
    {
      code: "const Fill = () => <li>{left} AI riders fill the grid.</li>;",
      errors: [{ messageId: "robot" }],
      filename: "screen.tsx",
    },
    {
      code: 'const line = <RuleLine label="Catch-up" value="None, for humans or AI" />;',
      errors: [{ messageId: "robot" }],
      filename: "screen.tsx",
    },
    {
      code: "const title = `Slag Row · Tier 2`;",
      errors: [{ messageId: "middot" }],
      filename: "screen.tsx",
    },
    {
      code: "const sign = <p>— Vex</p>;",
      errors: [{ messageId: "emDash" }],
      filename: "screen.tsx",
    },
  ],
  valid: [
    {
      code: "const Fill = () => <li>{left} street riders join to make 10.</li>;",
      filename: "screen.tsx",
    },
    "const title = `Slag Row, tier 2`;",
    'const kind = "pilot";',
    'const said = "Said it again";',
  ],
});
