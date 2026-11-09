import { hexOfWords } from "@racer/sim/room-tape";
import { HASH_WORDS } from "@racer/sim/snapshot-bytes";
import { hashBytes } from "@racer/sim/snapshot-hash";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

const SIM_KEY = "RUSHLINE_SIM";
const STEPPING_SOURCES = [
  "apps/rooms/src",
  "packages/sim/src",
  "packages/track/src",
] as const;

export const roomsSim = Config.String(SIM_KEY);

export const pinRoomsSim = (sim: string) =>
  ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ [SIM_KEY]: sim }), {
    asPrimary: true,
  });

const isStepping = (name: string): boolean =>
  name.endsWith(".ts") && !name.endsWith(".test.ts");

export const simFingerprint = Effect.fn("simFingerprint")(
  function* simFingerprint(root: string) {
    const fs = yield* FileSystem.FileSystem;
    const files: string[] = [];
    for (const folder of STEPPING_SOURCES) {
      const names = yield* fs.readDirectory(`${root}/${folder}`, {
        recursive: true,
      });
      for (const name of names) {
        if (isStepping(name)) {
          files.push(`${folder}/${name}`);
        }
      }
    }
    files.sort();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    for (const file of files) {
      const body = yield* fs.readFile(`${root}/${file}`);
      chunks.push(
        encoder.encode(`${file}\n`),
        encoder.encode(decoder.decode(body).replaceAll("\r\n", "\n"))
      );
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    const words = new Uint32Array(HASH_WORDS);
    hashBytes(new DataView(bytes.buffer), 0, total, words);
    return hexOfWords(words);
  }
);
