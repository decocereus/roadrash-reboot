const bitmap = { close: () => null, height: 1, width: 1 };

Object.assign(globalThis, {
  createImageBitmap: async () => await Promise.resolve(bitmap),
  self: globalThis,
});
