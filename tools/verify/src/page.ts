import { connect, evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
import { pageTarget } from "@racer/devtools/chrome";
import { released } from "@racer/devtools/cleanup";
import { byDeadline } from "@racer/devtools/deadline";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { InstanceState } from "./state.ts";
import { VerificationError } from "./verification-error.ts";

const POLL_MS = 100;

const readySignals = new Map([
  [
    "bar",
    "document.querySelector('[role=menu][aria-label=\"Clubhouse\"]') !== null",
  ],
  ["held", "globalThis.__rushlineHeld === true"],
  [
    "race",
    "document.querySelector('[role=meter][aria-label=\"Speed\"]') !== null",
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

export const heldFor = <A, E1, R1, B, E2, R2>(
  start: Effect.Effect<A, E1, R1>,
  ms: number,
  stop: Effect.Effect<B, E2, R2>
) =>
  Effect.uninterruptibleMask((restore) =>
    start.pipe(
      Effect.andThen(
        restore(Effect.sleep(ms)).pipe(Effect.onInterrupt(() => released(stop)))
      ),
      Effect.andThen(stop)
    )
  );

const truthy = Effect.fnUntraced(function* truthy(
  page: Session,
  expression: string
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
    yield* Effect.sleep(POLL_MS);
  }
});

export const waitFor = Effect.fn("rv.waitFor")(function* waitFor(
  page: Session,
  expression: string,
  deadline: number
) {
  return yield* truthy(page, expression).pipe(
    byDeadline(
      deadline,
      () =>
        new VerificationError({
          message: `Timed out waiting for ${expression}`,
          operation: "wait",
        })
    )
  );
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
