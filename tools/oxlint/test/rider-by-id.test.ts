import { riderByIdRule } from "../rushline/rules/rider-by-id.ts";
import { runRule } from "./cases.ts";

runRule("rushline/rider-by-id", riderByIdRule, {
  invalid: [
    {
      code: "const rival = state.riders[1];",
      errors: [{ messageId: "indexed" }],
    },
    {
      code: "const hitter = view.riders[rider.lastHitBy];",
      errors: [{ messageId: "indexed" }],
    },
    {
      code: "const pick = (riders: readonly Rider[], index: number) => riders[index];",
      errors: [{ messageId: "indexed" }],
    },
    {
      code: "for (let index = 0; index < riders.length; index += 1) {\n  later(() => riders[index]);\n}",
      errors: [{ line: 2, messageId: "indexed" }],
    },
    {
      code: "const last = state.riders[state.riders.length - 1];",
      errors: [{ messageId: "indexed" }],
    },
    {
      code: "const [me] = state.riders;",
      errors: [{ messageId: "destructured" }],
    },
    {
      code: "let me;\n[me] = riders;",
      errors: [{ line: 2, messageId: "destructured" }],
    },
    {
      code: "const rivals = state.riders.slice(1);",
      errors: [{ data: { method: "slice" }, messageId: "position" }],
    },
    {
      code: "const slot = view.riders.indexOf(rider);",
      errors: [{ data: { method: "indexOf" }, messageId: "position" }],
    },
    {
      code: "const me = race.riders.at(0);",
      errors: [{ data: { method: "at" }, messageId: "position" }],
    },
    {
      code: "for (const [index, rider] of state.riders.entries()) {\n  use(index, rider);\n}",
      errors: [{ data: { method: "entries" }, messageId: "position" }],
    },
    {
      code: "const others = state.riders.filter((rider, index) => index !== 0);",
      errors: [{ messageId: "callbackIndex" }],
    },
    {
      code: "const total = riders.reduce((sum, rider, index) => sum + index, 0);",
      errors: [{ messageId: "callbackIndex" }],
    },
    {
      code: "const mine = events.filter((event) => event.rider === 0);",
      errors: [{ messageId: "literal" }],
    },
    {
      code: "if (event.by < 0) {\n  use(event);\n}",
      errors: [{ messageId: "literal" }],
    },
    {
      code: "const chasing = -1 !== cop.chase;",
      errors: [{ messageId: "literal" }],
    },
  ],
  valid: [
    "const rider = riderOf(state.riders, event.rider);",
    "for (const rider of state.riders) {\n  use(rider);\n}",
    "for (let index = 0; index < state.riders.length; index += 1) {\n  const rider = state.riders[index];\n  use(rider, inputs[index]);\n}",
    "const { riders } = state;\nfor (let at = 0; at < riders.length; at += 1) {\n  use(riders[at]);\n}",
    'const racers = state.riders.filter((rider) => rider.profile.role === "racer");',
    "const ids = view.riders.map((rider) => rider.id);",
    "const total = riders.reduce((sum, rider) => sum + rider.s, 0);",
    "const count = state.riders.length;",
    'const fields = shape["riders"];',
    "const first = inputs[0];",
    "const [buildA] = urls.figures;",
    "const mine = events.filter((event) => event.rider === PLAYER_RIDER);",
    "const fresh = rider.finishTick >= 0;",
    "const odd = rider.id % 2 === 0;",
    'const same = event.kind === "crash";',
  ],
});
