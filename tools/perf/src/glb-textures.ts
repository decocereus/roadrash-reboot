import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { MeasurementFailed } from "./measurement-failed.ts";

const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const VP8L_SIGNATURE = 0x2f;
const VP8L_SIZE_AT = 21;
const DIMENSION_SPAN = 2 ** 14;
const RGBA_BYTES = 4;

const decodeGltf = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      bufferViews: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            byteLength: Schema.Number,
            byteOffset: Schema.optionalKey(Schema.Number),
          })
        )
      ),
      images: Schema.optionalKey(
        Schema.Array(Schema.Struct({ bufferView: Schema.Number }))
      ),
    })
  )
);

const losslessWebpSize = (
  image: Uint8Array
): readonly [number, number] | null => {
  const fourCC = new TextDecoder().decode(image.subarray(0, 16));
  if (
    !fourCC.startsWith("RIFF") ||
    !fourCC.endsWith("WEBPVP8L") ||
    image[VP8L_SIZE_AT - 1] !== VP8L_SIGNATURE
  ) {
    return null;
  }
  const bits = new DataView(
    image.buffer,
    image.byteOffset,
    image.byteLength
  ).getUint32(VP8L_SIZE_AT, true);
  return [
    (bits % DIMENSION_SPAN) + 1,
    (Math.floor(bits / DIMENSION_SPAN) % DIMENSION_SPAN) + 1,
  ];
};

const mipChainBytes = (width: number, height: number): number =>
  width * height * RGBA_BYTES +
  (width === 1 && height === 1
    ? 0
    : mipChainBytes(
        Math.max(1, Math.floor(width / 2)),
        Math.max(1, Math.floor(height / 2))
      ));

export const textureBytesOf = Effect.fnUntraced(function* textureBytesOf(
  name: string,
  glb: Uint8Array
) {
  const jsonStart = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES;
  const jsonBytes = new DataView(
    glb.buffer,
    glb.byteOffset,
    glb.byteLength
  ).getUint32(GLB_HEADER_BYTES, true);
  const gltf = yield* decodeGltf(
    new TextDecoder().decode(glb.subarray(jsonStart, jsonStart + jsonBytes))
  ).pipe(
    Effect.mapError(
      (cause) =>
        new MeasurementFailed({
          cause,
          lane: "build",
          message: `GLB ${name} has no readable glTF JSON.`,
        })
    )
  );
  const binStart = jsonStart + jsonBytes + CHUNK_HEADER_BYTES;
  let total = 0;
  for (const image of gltf.images ?? []) {
    const view = gltf.bufferViews?.[image.bufferView];
    const start = binStart + (view?.byteOffset ?? 0);
    const size = losslessWebpSize(
      glb.subarray(start, start + (view?.byteLength ?? 0))
    );
    if (size === null) {
      return yield* new MeasurementFailed({
        cause: null,
        lane: "build",
        message: `GLB ${name} embeds a texture that is not lossless WebP, the only format tools/blender/compress.ts writes.`,
      });
    }
    total += mipChainBytes(...size);
  }
  return total;
});
