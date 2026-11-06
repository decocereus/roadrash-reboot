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
    {
      code: 'const line = "Wait\\u2014go";',
      errors: [{ messageId: "emDash" }],
      filename: "screen.tsx",
    },
    {
      code: 'const line = "\\u0041I riders";',
      errors: [{ messageId: "robot" }],
      filename: "screen.tsx",
    },
    {
      code: 'const head = <h2 title="Road &middot; Tier">Road</h2>;',
      errors: [{ messageId: "middot" }],
      filename: "screen.tsx",
    },
    {
      code: "const line = <p>Wait &mdash; go</p>;",
      errors: [{ messageId: "emDash" }],
      filename: "screen.tsx",
    },
    {
      code: "const line = <p>Wait &#8212; go</p>;",
      errors: [{ messageId: "emDash" }],
      filename: "screen.tsx",
    },
  ],
  valid: [
    {
      code: "const line = <p>Fast &amp; loud</p>;",
      filename: "screen.tsx",
    },
    "const pattern = /AI/u;",
    {
      code: "const line = <p>&#x110000; &#99999999;</p>;",
      filename: "screen.tsx",
    },
    {
      code: "const Fill = () => <li>{left} street riders join to make 10.</li>;",
      filename: "screen.tsx",
    },
    "const title = `Slag Row, tier 2`;",
    'const kind = "pilot";',
    'const said = "Said it again";',
  ],
});
