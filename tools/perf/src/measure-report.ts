import { cpus } from "node:os";

import { LATE_MS, mean } from "./measure-model.ts";
import type { PartSummary, RunResult } from "./measure-model.ts";
import type { Options } from "./measure-options.ts";

const ms = (value: number): string => value.toFixed(2).padStart(7);

const spread = (values: readonly number[]): string =>
  `${ms(Math.min(...values))} - ${ms(Math.max(...values))}`;

export const printRun = (result: RunResult) => {
  const { interval, trace } = result;
  console.log(
    `run ${result.run}: ${result.frames} frames (${LATE_MS.map((limit, index) => `${result.late[index] ?? 0} over ${limit} ms`).join(", ")})  ${result.fps.toFixed(1)} fps  frame mean ${interval.mean.toFixed(2)} p50 ${interval.p50.toFixed(2)} p95 ${interval.p95.toFixed(2)} p99 ${interval.p99.toFixed(2)} worst ${interval.max.toFixed(2)} ms  js ${result.jsFrame.mean.toFixed(2)} ms  calls ${result.calls.mean.toFixed(0)}  tris ${(result.triangles.mean / 1e6).toFixed(2)} M  load ${result.load.toFixed(1)}/${cpus().length}`
  );
  if (trace) {
    console.log(
      `  gc minor ${trace.minorGc.count} (${trace.minorGc.totalMs.toFixed(1)} ms, max ${trace.minorGc.maxMs.toFixed(2)})  major ${trace.majorGc.count} (${trace.majorGc.totalMs.toFixed(1)} ms, max ${trace.majorGc.maxMs.toFixed(2)})  long tasks ${trace.longTasks.count}  longest task ${trace.longestTaskMs.toFixed(1)} ms over ${(trace.spanMs / 1000).toFixed(1)} s`
    );
  }
  for (const each of result.growth) {
    const shown = each.grownAt.slice(0, 12).join(", ");
    console.log(
      `  ${each.resource} ${each.first} -> ${each.last}, grew in ${each.grownAt.length} frames${shown ? ` (ticks ${shown}${each.grownAt.length > 12 ? ", ..." : ""})` : ""}`
    );
  }
  for (const stall of result.stalls) {
    const parts = stall.parts
      .map(([part, cpu]) => `${part} ${cpu.toFixed(1)}`)
      .join(", ");
    console.log(
      `  late frame after tick ${stall.tick}: ${stall.interval.toFixed(1)} ms, the frame before it drew ${stall.calls} calls, js parts: ${parts || "none"}`
    );
    for (const event of stall.events) {
      console.log(
        `    ${event.ms.toFixed(1).padStart(7)} ms  ${event.thread.padEnd(34)} ${event.name}`
      );
    }
  }
};

export const printSummary = (
  options: Options,
  results: readonly RunResult[]
) => {
  const [first] = results;
  if (!first) {
    return;
  }
  console.log(
    `\n${options.label}  ${options.url}  ticks ${options.from}-${options.to}`
  );
  console.log(`renderer  ${first.renderer}`);
  console.log(
    `page ${first.page.width}x${first.page.height} @${first.page.ratio}  pixel ratio ${first.pixelRatios.join(",")}  rung ${first.rungs.join(",")}  gpu timer ${first.gpuTimer ? "yes" : "not exposed"}  heap ${(first.heapAfter.usedSize / 1e6).toFixed(1)} MB`
  );
  const across = (pick: (result: RunResult) => number) =>
    `${ms(mean(results.map(pick)))}  [${spread(results.map(pick))}]`;
  console.log("metric             mean over runs  [min - max across runs]");
  console.log(`fps                ${across((r) => r.fps)}`);
  console.log(`frame mean ms      ${across((r) => r.interval.mean)}`);
  console.log(`frame p50 ms       ${across((r) => r.interval.p50)}`);
  console.log(`frame p95 ms       ${across((r) => r.interval.p95)}`);
  console.log(`frame p99 ms       ${across((r) => r.interval.p99)}`);
  console.log(`frame worst ms     ${across((r) => r.interval.max)}`);
  console.log(`js per frame ms    ${across((r) => r.jsFrame.mean)}`);
  console.log(`js p95 ms          ${across((r) => r.jsFrame.p95)}`);
  console.log(`draw calls         ${across((r) => r.calls.mean)}`);
  console.log(`triangles M        ${across((r) => r.triangles.mean / 1e6)}`);
  console.log(
    "\npart        cpu mean   cpu p95   gpu mean   gpu p95    calls   tris k"
  );
  for (const [index, part] of first.parts.entries()) {
    const of = (pick: (each: PartSummary) => number) =>
      mean(results.map((result) => pick(result.parts[index] ?? part)));
    const gpu = first.gpuTimer
      ? `${ms(of((each) => each.gpu?.mean ?? 0))}   ${ms(of((each) => each.gpu?.p95 ?? 0))}`
      : "      -         -";
    console.log(
      `${part.part.padEnd(10)} ${ms(of((each) => each.cpu.mean))}   ${ms(of((each) => each.cpu.p95))}   ${gpu}  ${of(
        (each) => each.calls
      )
        .toFixed(0)
        .padStart(
          6
        )}  ${(of((each) => each.triangles) / 1000).toFixed(0).padStart(6)}`
    );
  }
  for (const result of results) {
    if (result.hot) {
      console.log(
        `\nrun ${result.run} top JS self time: ${result.hot.busyMs.toFixed(0)} ms in named functions (GC included), ${result.hot.programMs.toFixed(0)} ms (program), ${result.hot.idleMs.toFixed(0)} ms idle`
      );
      for (const each of result.hot.top) {
        console.log(
          `${each.selfMs.toFixed(1).padStart(8)} ms ${(each.share * 100).toFixed(1).padStart(5)}%  ${each.name.padEnd(28)} ${each.where}`
        );
      }
    }
    if (result.allocations) {
      console.log(
        `\nrun ${result.run} allocated ${(result.allocations.bytes / 1e6).toFixed(1)} MB in the window, by site:`
      );
      for (const each of result.allocations.top) {
        console.log(
          `${(each.bytes / 1e3).toFixed(0).padStart(8)} kB ${(each.share * 100).toFixed(1).padStart(5)}%  ${each.name.padEnd(28)} ${each.where}`
        );
      }
    }
  }
};
