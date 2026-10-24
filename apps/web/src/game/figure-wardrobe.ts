import type { RiderId } from "@racer/sim/state";

import type { Decoded, LoadCelebrity, RiderAsset } from "./assets.ts";
import type { CelebrityId } from "./figure-wear.ts";

export type Dressing = ReadonlyMap<RiderId, RiderAsset>;

export const undressed: Dressing = new Map();

export interface Wardrobe {
  readonly dress: (
    worn: ReadonlyMap<RiderId, CelebrityId>
  ) => Promise<Dressing | null>;
  readonly keep: (dressing: Dressing) => void;
  readonly dispose: () => void;
}

export const createWardrobe = (load: LoadCelebrity): Wardrobe => {
  const mount = new AbortController();
  const loads = new Map<CelebrityId, Promise<Decoded<RiderAsset> | null>>();
  const held = new Map<CelebrityId, Decoded<RiderAsset>>();

  const loadOnce = async (
    id: CelebrityId
  ): Promise<Decoded<RiderAsset> | null> => {
    try {
      const decoded = await load(id, mount.signal);
      if (decoded !== null && !mount.signal.aborted) {
        held.set(id, decoded);
      }
      return decoded;
    } catch (error) {
      loads.delete(id);
      throw error;
    }
  };

  const loaded = async (
    id: CelebrityId
  ): Promise<Decoded<RiderAsset> | null> => {
    const known = loads.get(id);
    if (known) {
      return await known;
    }
    const loading = loadOnce(id);
    loads.set(id, loading);
    return await loading;
  };

  const dress = async (
    worn: ReadonlyMap<RiderId, CelebrityId>
  ): Promise<Dressing | null> => {
    const fitted = await Promise.all(
      [...worn].map(async ([rider, id]) => ({
        decoded: await loaded(id),
        rider,
      }))
    );
    const dressing = new Map<RiderId, RiderAsset>();
    for (const { decoded, rider } of fitted) {
      if (decoded === null || mount.signal.aborted) {
        return null;
      }
      dressing.set(rider, decoded.value);
    }
    return dressing;
  };

  const keep = (dressing: Dressing): void => {
    const worn = new Set(dressing.values());
    for (const [id, decoded] of held) {
      if (!worn.has(decoded.value)) {
        held.delete(id);
        loads.delete(id);
        decoded.release();
      }
    }
  };

  const dispose = (): void => {
    mount.abort();
    for (const decoded of held.values()) {
      decoded.release();
    }
    held.clear();
    loads.clear();
  };

  return { dispose, dress, keep };
};
