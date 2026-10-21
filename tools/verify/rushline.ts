import { main } from "./src/cli.ts";

const SCRIPT = import.meta.filename;

await main(SCRIPT);
