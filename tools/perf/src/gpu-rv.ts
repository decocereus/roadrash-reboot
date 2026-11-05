import path from "node:path";

import { benchChildEnv } from "@racer/devtools/bench-lock";
import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";

import { MeasurementFailed } from "./measurement-failed.ts";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
export const RV = path.join(REPO_ROOT, "tools/verify/rushline.ts");
export const PARK = "/kit";
export const OPEN_TIMEOUT_S = 90;
export const WINDOW_TIMEOUT_S = 240;

export const failed =
  (message: string) => (cause: { readonly message: string }) =>
    new MeasurementFailed({
      cause,
      lane: "gpu",
      message: `${message}: ${cause.message}`,
    });

export const rv = (args: readonly string[]) =>
  ToolProcesses.use((processes) =>
    processes.run(process.execPath, [RV, ...args], {
      cwd: REPO_ROOT,
      env: benchChildEnv(),
    })
  ).pipe(
    Effect.map((output) => output.stdout.trim()),
    Effect.mapError(failed(`rv ${args.slice(0, 3).join(" ")}`))
  );

export const consoleErrors = (run: string) =>
  rv(["console", "--run", run, "errors"]).pipe(
    Effect.map((text) =>
      Number(
        /^(?<count>\d+) lines from /mu.exec(text)?.groups?.count ?? Number.NaN
      )
    )
  );
