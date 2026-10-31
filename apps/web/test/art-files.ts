import { readFileSync } from "node:fs";

import { cachedFile } from "@racer/art/cache";

const ART_ROUTE = "/art/";

export const artFile = (url: string): ArrayBuffer => {
  if (!url.startsWith(ART_ROUTE)) {
    throw new Error(`${url} is not an art route URL.`);
  }
  const file = readFileSync(cachedFile(url.slice(ART_ROUTE.length)));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
};
