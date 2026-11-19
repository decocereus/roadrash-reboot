const BYTES_PER_CHUNK = 0x80_00;

const base64Of = (bytes: Uint8Array): string => {
  let text = "";
  for (let start = 0; start < bytes.length; start += BYTES_PER_CHUNK) {
    text += String.fromCodePoint(
      ...bytes.subarray(start, start + BYTES_PER_CHUNK)
    );
  }
  return btoa(text);
};

const recorded = async (
  recorder: MediaRecorder,
  seconds: number
): Promise<Blob> => {
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", ({ data }) => {
    chunks.push(data);
  });
  const stopped = Promise.withResolvers<null>();
  recorder.addEventListener("stop", () => {
    stopped.resolve(null);
  });
  recorder.start();
  setTimeout(() => {
    recorder.stop();
  }, seconds * 1000);
  await stopped.promise;
  return new Blob(chunks, { type: recorder.mimeType });
};

export const recordTap = async (
  stream: MediaStream,
  seconds: number
): Promise<string> => {
  const blob = await recorded(new MediaRecorder(stream), seconds);
  return base64Of(new Uint8Array(await blob.arrayBuffer()));
};
