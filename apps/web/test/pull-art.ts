import { execFileSync } from "node:child_process";
import path from "node:path";

const pullArt = () => {
  execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, "../../../tools/art/pull.ts")],
    { stdio: "inherit" }
  );
};

export default pullArt;
