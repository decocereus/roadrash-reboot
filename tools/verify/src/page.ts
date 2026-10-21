import { setTimeout as sleep } from "node:timers/promises";

import { connect, evaluate } from "@racer/devtools/cdp";
import type { Session } from "@racer/devtools/cdp";
import { pageTarget } from "@racer/devtools/chrome";
import * as Schema from "effect/Schema";

import type { InstanceState } from "./state.ts";

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

const attach = async (state: InstanceState): Promise<Session> => {
  const { origin } = new URL(state.serverUrl);
  const socket =
    (await pageTarget(state.devtoolsPort, origin)) ??
    (await pageTarget(state.devtoolsPort, "http"));
  if (socket === undefined || socket === "") {
    throw new Error(
      `No page in the run's browser on DevTools port ${state.devtoolsPort}. Run rv doctor.`
    );
  }
  return await connect(socket);
};

export const withPage = async <T>(
  state: InstanceState,
  act: (page: Session) => Promise<T>
): Promise<T> => {
  const page = await attach(state);
  try {
    return await act(page);
  } finally {
    page.close();
  }
};

export const waitFor = async (
  page: Session,
  expression: string,
  deadline: number
): Promise<string> => {
  const value = await evaluate(
    page,
    `(() => { try { const v = (${expression}); return v ? JSON.stringify(v) : ""; } catch { return ""; } })()`,
    Schema.String
  );
  if (value !== "") {
    return value;
  }
  if (Date.now() > deadline) {
    throw new Error(`Timed out waiting for ${expression}`);
  }
  await sleep(POLL_MS);
  return await waitFor(page, expression, deadline);
};

export const navigate = async (
  page: Session,
  url: string,
  deadline: number
): Promise<void> => {
  await evaluate(
    page,
    'Reflect.set(globalThis, "__rvLeaving", true)',
    Schema.Boolean
  );
  await page.send("Page.navigate", { url });
  await waitFor(
    page,
    `globalThis.__rvLeaving !== true && document.readyState === "complete" && location.href === ${JSON.stringify(url)}`,
    deadline
  );
};
