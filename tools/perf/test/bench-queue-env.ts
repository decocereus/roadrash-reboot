import { benchTurnSettings } from "@racer/devtools/bench-turn";

for (const name of benchTurnSettings) {
  Reflect.deleteProperty(process.env, name);
}
