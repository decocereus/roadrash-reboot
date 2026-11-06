import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";
import { TaggedError as TaggedErrorClass } from "effect/Schema";
import * as Stream from "effect/Stream";

import { RULES } from "./lifecycle-checks.ts";
import type { Rule } from "./lifecycle-checks.ts";

export class LifecycleToolFailed extends TaggedErrorClass<LifecycleToolFailed>()(
  "LifecycleToolFailed",
  { cause: Schema.Defect(), message: Schema.String }
) {}

interface Pinned {
  readonly file: string;
  readonly sha256: string;
  readonly url: string;
}

interface PinnedJava extends Pinned {
  readonly java: string;
}

const JRE_RELEASE =
  "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10";
const JRE_HOME = "jdk-21.0.9+10-jre";

const TLA_TOOLS: Pinned = {
  file: "tla2tools-1.7.4.jar",
  sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
  url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
};

const JAVA = {
  "darwin-arm64": {
    file: "OpenJDK21U-jre_aarch64_mac_hotspot_21.0.9_10.tar.gz",
    java: `${JRE_HOME}/Contents/Home/bin/java`,
    sha256: "1f7f6506b598e85d7d8ff8b36563d98657d2d81b16bfca3cd242d7906cfbd11b",
    url: `${JRE_RELEASE}/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.9_10.tar.gz`,
  },
  "darwin-x64": {
    file: "OpenJDK21U-jre_x64_mac_hotspot_21.0.9_10.tar.gz",
    java: `${JRE_HOME}/Contents/Home/bin/java`,
    sha256: "945abc49249f1e89a2a6a008d70d63dc42b25bbe5e1711ff97aeec70063008d2",
    url: `${JRE_RELEASE}/OpenJDK21U-jre_x64_mac_hotspot_21.0.9_10.tar.gz`,
  },
  "linux-x64": {
    file: "OpenJDK21U-jre_x64_linux_hotspot_21.0.9_10.tar.gz",
    java: `${JRE_HOME}/bin/java`,
    sha256: "aeab55d064a1a27a3744b0880b9b414077b4ed2b1790817eea3df60aec946431",
    url: `${JRE_RELEASE}/OpenJDK21U-jre_x64_linux_hotspot_21.0.9_10.tar.gz`,
  },
} as const satisfies Record<string, PinnedJava>;

const isPinnedPlatform = (platform: string): platform is keyof typeof JAVA =>
  Object.hasOwn(JAVA, platform);

const cacheDirectory = path.join(os.homedir(), ".cache/rushline/tla");

const sha256Of = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const download = (url: string) =>
  Effect.tryPromise({
    catch: (cause) =>
      new LifecycleToolFailed({ cause, message: `Could not download ${url}.` }),
    try: async () => {
      const response = await fetch(url, {
        headers: { "User-Agent": "rushline-tools" },
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  });

const pinnedFile = Effect.fn("lifecycle.pinnedFile")(function* pinnedFile({
  file,
  sha256,
  url,
}: Pinned) {
  const fs = yield* FileSystem.FileSystem;
  const target = path.join(cacheDirectory, file);
  if (!(yield* fs.exists(target))) {
    yield* fs.makeDirectory(cacheDirectory, { recursive: true });
    const partial = `${target}.${randomUUID()}.partial`;
    yield* fs.writeFile(partial, yield* download(url));
    yield* fs.rename(partial, target);
  }
  const found = sha256Of(yield* fs.readFile(target));
  if (found !== sha256) {
    return yield* new LifecycleToolFailed({
      cause: { found, pinned: sha256 },
      message: `${target} does not match its pinned SHA-256. Delete it to download it again.`,
    });
  }
  return target;
});

export const exitOf = Effect.fn("lifecycle.exitOf")(function* exitOf(
  command: ChildProcess.Command
) {
  const spawner = yield* ChildProcessSpawner;
  const handle = yield* spawner.spawn(command);
  const [output, code] = yield* Effect.all(
    [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode],
    { concurrency: "unbounded" }
  );
  return { code: Number(code), output };
}, Effect.scoped);

const pinnedJava = Effect.fn("lifecycle.pinnedJava")(function* pinnedJava() {
  const platform = `${process.platform}-${process.arch}`;
  if (!isPinnedPlatform(platform)) {
    return yield* new LifecycleToolFailed({
      cause: { platform },
      message: `No Java is pinned for ${platform}. Pinned: ${Object.keys(JAVA).join(", ")}.`,
    });
  }
  const pin = JAVA[platform];
  const fs = yield* FileSystem.FileSystem;
  const home = path.join(cacheDirectory, `jre-21.0.9_10-${platform}`);
  const java = path.join(home, pin.java);
  if (!(yield* fs.exists(java))) {
    const archive = yield* pinnedFile(pin);
    const partial = `${home}.${randomUUID()}.partial`;
    yield* fs.makeDirectory(partial, { recursive: true });
    const untar = yield* exitOf(
      ChildProcess.make("tar", ["-xzf", archive, "-C", partial], {
        stdin: "ignore",
      })
    );
    if (untar.code !== 0) {
      return yield* new LifecycleToolFailed({
        cause: untar,
        message: `tar could not unpack ${archive}.`,
      });
    }
    yield* fs.rename(partial, home);
  }
  return java;
});

export const pinnedTools = Effect.fn("lifecycle.pinnedTools")(
  function* pinnedTools() {
    return { jar: yield* pinnedFile(TLA_TOOLS), java: yield* pinnedJava() };
  }
);

interface Counted {
  readonly depth: number;
  readonly distinct: number;
}

export type Outcome =
  | ({ readonly kind: "passed" } & Counted)
  | { readonly kind: "broken"; readonly rule: Rule | "deadlock" | "liveness" }
  | { readonly kind: "failed"; readonly reason: string };

const countOf = (output: string, pattern: RegExp): number =>
  Number(
    [...output.matchAll(pattern)].at(-1)?.groups?.count?.replaceAll(",", "") ??
      Number.NaN
  );

const brokenRule = (output: string): Outcome | null => {
  const named =
    /^Error: (?:Invariant|Action property) (?<rule>\w+) is violated/mu.exec(
      output
    )?.groups?.rule;
  const rule = RULES.find((each) => each === named);
  if (rule !== undefined) {
    return { kind: "broken", rule };
  }
  if (/^Error: Temporal properties were violated\./mu.test(output)) {
    return { kind: "broken", rule: "liveness" };
  }
  if (/^Error: Deadlock reached\./mu.test(output)) {
    return { kind: "broken", rule: "deadlock" };
  }
  return null;
};

export const outcomeOf = (code: number, output: string): Outcome => {
  if (code === 0 && output.includes("No error has been found.")) {
    return {
      depth: countOf(
        output,
        /depth of the complete state graph search is (?<count>\d+)/gu
      ),
      distinct: countOf(output, /(?<count>[\d,]+) distinct states found/gu),
      kind: "passed",
    };
  }
  return (
    brokenRule(output) ?? {
      kind: "failed",
      reason:
        output
          .split("\n")
          .filter((line) => line.startsWith("Error"))
          .join("\n") || `TLC exited ${code}.`,
    }
  );
};
