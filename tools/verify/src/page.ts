import { connect, evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
import { pageTarget } from "@racer/devtools/chrome";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { InstanceState } from "./state.ts";
import { VerificationError } from "./verification-error.ts";

const POLL_MS = 100;

const readySignals = new Map([
  ["held", "globalThis.__rushlineHeld === true"],
  [
    "race",
    "document.querySelector('[role=meter][aria-label=\"Speed\"]') !== null",
  ],
  [
    "title",
    "document.querySelector('[role=menu][aria-label=\"Title menu\"]') !== null",
  ],
]);

export const expressionFor = (signal: string): string =>
  readySignals.get(signal) ?? signal;

const attach = Effect.fnUntraced(function* attach(state: InstanceState) {
  const { origin } = new URL(state.serverUrl);
  const socket =
    (yield* pageTarget(state.devtoolsPort, origin)) ??
    (yield* pageTarget(state.devtoolsPort, "http"));
  if (socket === undefined || socket === "") {
    return yield* new VerificationError({
      message: `No page in the run's browser on DevTools port ${state.devtoolsPort}. Run rv doctor.`,
      operation: "attach",
      run: state.run,
    });
  }
  return yield* connect(socket);
});

export const withPage = <A, E, R>(
  state: InstanceState,
  act: (page: Session) => Effect.Effect<A, E, R>
) => Effect.scoped(Effect.flatMap(attach(state), act));

export const waitFor = Effect.fn("rv.waitFor")(function* waitFor(
  page: Session,
  expression: string,
  deadline: number
) {
  for (;;) {
    const value = yield* evaluate(
      page,
      `(() => { try { const v = (${expression}); return v ? JSON.stringify(v) : ""; } catch { return ""; } })()`,
      Schema.String
    );
    if (value !== "") {
      return value;
    }
    if ((yield* Clock.currentTimeMillis) > deadline) {
      return yield* new VerificationError({
        message: `Timed out waiting for ${expression}`,
        operation: "wait",
      });
    }
    yield* Effect.sleep(POLL_MS);
  }
});

export const navigate = Effect.fn("rv.navigate")(function* navigate(
  page: Session,
  url: string,
  deadline: number
) {
  yield* evaluate(
    page,
    'Reflect.set(globalThis, "__rvLeaving", true)',
    Schema.Boolean
  );
  yield* page.send("Page.navigate", { url });
  yield* waitFor(
    page,
    `globalThis.__rvLeaving !== true && document.readyState === "complete" && location.href === ${JSON.stringify(url)}`,
    deadline
  );
});
