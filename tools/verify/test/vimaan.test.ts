import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const entry = path.join(root, "tools/verify/vimaan.ts");
const FAKE_SSH = `#!/bin/sh
for remote; do :; done
printf '%s\\n' "$remote" >> "$FAKE_SSH_LOG"
exec /bin/sh -c "$remote"
`;

const farSide = () => {
  const temp = mkdtempSync(path.join(tmpdir(), "rushline-vimaan-test-"));
  onTestFinished(() => {
    rmSync(temp, { force: true, recursive: true });
  });
  const bin = path.join(temp, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "ssh"), FAKE_SSH, { mode: 0o755 });
  const log = path.join(temp, "ssh.log");
  const vimaan = (args: readonly string[]) =>
    spawnSync(process.execPath, [entry, ...args], {
      encoding: "utf-8",
      env: {
        ...process.env,
        FAKE_SSH_LOG: log,
        PATH: `${bin}:${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
        RUSHLINE_VIMAAN_CHECKOUT: root,
        TMPDIR: temp,
      },
    });
  return { log, vimaan };
};

describe("pnpm vimaan over a stand-in for ssh", () => {
  it("books, shows and releases through rv book on the far side, quoting every word", () => {
    const { log, vimaan } = farSide();
    const booked = vimaan(["book", "lane-a", "30", "Ann's", "frame campaign"]);
    expect(booked.status).toBe(0);
    expect(booked.stdout).toContain("BOOKING=lane-a-1");
    expect(vimaan(["status"]).stdout).toContain(
      "lane-a-1 holds it for Ann's frame campaign"
    );
    expect(vimaan(["release", "lane-a-1"]).status).toBe(0);
    expect(readFileSync(log, "utf-8").split("\n")[0]).toBe(
      `cd ${root} && node tools/verify/rushline.ts book lane-a 30 'Ann'\\''s' 'frame campaign'`
    );
  });

  it("passes the far side's exit code through", () => {
    const { vimaan } = farSide();
    const released = vimaan(["release", "nobody-3"]);
    expect(released.status).toBe(1);
    expect(released.stdout).toContain("nobody-3: no such booking.");
    const waited = vimaan(["wait", "nobody-3"]);
    expect(waited.status).toBe(1);
    expect(waited.stdout).toContain("nobody-3: no such booking.");
  });

  it("refuses a run without its checkout, label and command", () => {
    const { vimaan } = farSide();
    const refused = vimaan(["run", "lane-a-1", "campaign"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(
      "pnpm vimaan run takes the booking's id, --cwd"
    );
  });
});
