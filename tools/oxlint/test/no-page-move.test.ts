import { noPageMoveRule } from "../rushline/rules/no-page-move.ts";
import { runRule } from "./cases.ts";

const load = { messageId: "load" };
const push = { messageId: "push" };

runRule("rushline/no-page-move", noPageMoveRule, {
  invalid: [
    {
      code: 'globalThis.location.assign(roomLink(roomId) + "&via=moved");',
      errors: [load],
    },
    { code: 'globalThis.location.assign("/");', errors: [load] },
    { code: 'location.replace("/?room=abcd1234");', errors: [load] },
    { code: 'window.location.href = "/";', errors: [load] },
    { code: 'location.search = "?room=abcd1234";', errors: [load] },
    { code: 'globalThis.location = "/";', errors: [load] },
    { code: 'page["location"]["href"] = "/";', errors: [load] },
    {
      code: 'globalThis.history.pushState(null, "", "/?room=abcd1234");',
      errors: [push],
    },
  ],
  valid: [
    'globalThis.history.replaceState(globalThis.history.state, "", "/?room=abcd1234");',
    "globalThis.location.reload();",
    "const search = new URLSearchParams(globalThis.location.search);",
    'const link = globalThis.location.origin + "/?room=abcd1234";',
    'ids.replace("a", "b");',
    "Object.assign(target, source);",
    "seat.leave();",
  ],
});
