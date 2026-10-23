import { readFileSync } from "node:fs";
import path from "node:path";

import { noHotAllocationRule } from "../rushline/rules/no-hot-allocation.ts";
import { runRule } from "./cases.ts";

const hotBodies = {
  "apps/web/src/game/bench-profile.ts": [["createBenchProfile", "record"]],
  "apps/web/src/game/fixed-tick.ts": [["createFixedTick", "advance"]],
  "apps/web/src/game/frame-loop.ts": [
    ["installFrameLoop", "noteCallback"],
    ["installFrameLoop", "setAnimationLoop()"],
  ],
  "apps/web/src/game/game.ts": [
    ["startGame", "readInputs"],
    ["startGame", "tick"],
    ["startGame", "draw"],
  ],
  "apps/web/src/game/input.ts": [["createControls", "read"]],
  "packages/sim/src/bench-workload.ts": [["observeWorkload"], ["racersAhead"]],
  "packages/sim/src/pilot-corners.ts": [["planForecast"]],
  "packages/sim/src/pilot-forecast.ts": [["carsAhead"]],
  "packages/sim/src/pilot.ts": [["pilotInput"]],
  "packages/sim/src/race.ts": [["stepRace"]],
};

const repository = path.join(import.meta.dirname, "../../..");

const actualSource = (file: string) => ({
  code: readFileSync(path.join(repository, file), "utf-8"),
  filename: file,
  options: [{ bodies: hotBodies }],
});

const inStep = {
  filename: "packages/sim/src/race.ts",
  options: [{ bodies: { "packages/sim/src/race.ts": [["stepRace"]] } }],
};

const inLoop = {
  filename: "apps/web/src/game/frame-loop.ts",
  options: [
    {
      bodies: {
        "apps/web/src/game/frame-loop.ts": [
          ["installFrameLoop", "setAnimationLoop()"],
        ],
      },
    },
  ],
};

const inGame = {
  filename: "apps/web/src/game/game.ts",
  options: [
    {
      bodies: {
        "apps/web/src/game/game.ts": [
          ["createGame", "readInputs"],
          ["createGame", "tick"],
        ],
      },
    },
  ],
};

const built = (kind: string, line = 2) => ({
  data: { body: "stepRace", kind },
  line,
  messageId: "allocation",
});

const step = (body: string) =>
  `export const stepRace = (state: State, inputs: Input[]) => {\n${body}\n};`;

runRule("rushline/no-hot-allocation", noHotAllocationRule, {
  invalid: [
    {
      code: step("  state.last = { tick: state.tick };"),
      errors: [built("an object literal")],
      ...inStep,
    },
    {
      code: step("  state.order = [1, 2];"),
      errors: [built("an array literal")],
      ...inStep,
    },
    {
      code: step("  push(...inputs);"),
      errors: [built("a spread copy")],
      ...inStep,
    },
    {
      code: step("  state.seen = new Set<number>();"),
      errors: [built("an instance with `new`")],
      ...inStep,
    },
    {
      code: step("  state.hit = inputs.some((input) => input.punch);"),
      errors: [built("a function")],
      ...inStep,
    },
    {
      code: step(
        "  state.first = inputs.find(function chosen(input) { return input.kick; });"
      ),
      errors: [built("a function")],
      ...inStep,
    },
    {
      code: step("  function settle() { return state.tick; }\n  settle();"),
      errors: [built("a function")],
      ...inStep,
    },
    {
      code: step("  const { tick, ...others } = state;\n  use(tick, others);"),
      errors: [built("a rest container")],
      ...inStep,
    },
    {
      code: step("  const [first, ...more] = inputs;\n  use(first, more);"),
      errors: [built("a rest container")],
      ...inStep,
    },
    {
      code: "export const stepRace = (state: State, ...inputs: Input[]) => {\n  use(state, inputs);\n};",
      errors: [built("a rest container", 1)],
      ...inStep,
    },
    {
      code: step("  state.view = state.buffer.subarray(0, 4);"),
      errors: [built("a typed-array view with `subarray`")],
      ...inStep,
    },
    {
      code: "export const installFrameLoop = (renderer: Renderer) => {\n  renderer.setAnimationLoop((now: number) => {\n    return () => now;\n  });\n};",
      errors: [
        {
          data: {
            body: "installFrameLoop > setAnimationLoop()",
            kind: "a function",
          },
          line: 3,
          messageId: "allocation",
        },
      ],
      ...inLoop,
    },
    {
      code: "export const installFrameLoop = (renderer: Renderer) => {\n  renderer.setAnimationLoop((now: number) => {\n    renderer.last = { now };\n  });\n};",
      errors: [
        {
          data: {
            body: "installFrameLoop > setAnimationLoop()",
            kind: "an object literal",
          },
          messageId: "allocation",
        },
      ],
      ...inLoop,
    },
    {
      code: "export const createGame = () => {\n  const readInputs = () => {};\n  const later = () => {\n    const tick = () => ({ moved: true });\n    return tick;\n  };\n  return [readInputs, later];\n};",
      errors: [
        {
          data: { body: "createGame > tick", count: "0" },
          messageId: "missingBody",
        },
      ],
      ...inGame,
    },
    {
      code: "export const createGame = () => {\n  const readInputs = () => 1;\n  const tick = () => 2;\n  const tick2 = { tick: () => 3 };\n  return [readInputs, tick, tick2];\n};",
      errors: [
        {
          data: { body: "createGame > tick", count: "2" },
          messageId: "duplicateBody",
        },
      ],
      ...inGame,
    },
    {
      code: "export const stepRace = () => 1;",
      errors: [
        {
          data: { file: "packages/sim/src/race.ts" },
          messageId: "noBodies",
        },
      ],
      filename: "packages/sim/src/race.ts",
      options: [{ bodies: {} }],
    },
  ],
  valid: [
    {
      code: "export const installFrameLoop = (renderer: Renderer) => {\n  const buffer = new Float64Array(4);\n  const parts = [buffer, { at: 0 }];\n  renderer.setAnimationLoop((now: number) => {\n    buffer[0] = now;\n    renderer.draw(parts.length);\n  });\n};",
      ...inLoop,
    },
    {
      code: "export const createFixedTick = (clock: Clock, tick: () => void) => {\n  const advance = (seconds: number): number => {\n    const { accumulator } = clock;\n    let ticks = 0;\n    for (let left = accumulator + seconds; left >= 1; left -= 1) {\n      tick();\n      ticks += 1;\n    }\n    return ticks;\n  };\n  return advance;\n};",
      filename: "apps/web/src/game/fixed-tick.ts",
      options: [
        {
          bodies: {
            "apps/web/src/game/fixed-tick.ts": [["createFixedTick", "advance"]],
          },
        },
      ],
    },
    {
      code: "const throwRider = (state: State, index: number) => state.riders[index];\nexport const stepRace = (state: State, into: Float64Array, from: Float64Array) => {\n  contacts(state, throwRider);\n  const [first] = state.riders;\n  for (let index = 0; index < 4; index += 1) {\n    into[index] = from[index] ?? 0;\n  }\n  return first;\n};",
      ...inStep,
    },
    ...Object.keys(hotBodies).map(actualSource),
  ],
});
