class Bitmap {
  height = 1;
  width = 1;

  close(): void {
    this.height = 0;
    this.width = 0;
  }
}

Object.assign(globalThis, {
  ImageBitmap: Bitmap,
  createImageBitmap: async () => await Promise.resolve(new Bitmap()),
  self: globalThis,
});
