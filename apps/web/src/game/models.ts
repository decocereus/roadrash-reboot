import bike from "./models/bike.glb?url";
import car from "./models/car.glb?url";
import riderA from "./models/rider_a.glb?url";
import riderB from "./models/rider_b.glb?url";
import riderC from "./models/rider_c.glb?url";
import van from "./models/van.glb?url";

export const modelUrls = {
  bike,
  car,
  riders: [riderA, riderB, riderC],
  van,
} as const;

const downloads = new Map<string, Promise<ArrayBuffer>>();

const download = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The model ${url} answered ${response.status}.`);
  }
  return response.arrayBuffer();
};

export const modelBytes = (url: string): Promise<ArrayBuffer> => {
  const started = downloads.get(url) ?? download(url);
  downloads.set(url, started);
  return started;
};

export const startModelDownloads = (): void => {
  for (const url of [bike, car, van, riderA, riderB, riderC]) {
    modelBytes(url).catch(() => null);
  }
};
