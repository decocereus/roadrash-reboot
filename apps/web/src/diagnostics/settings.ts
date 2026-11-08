import { frameRates, testDevices } from "@racer/telemetry/limits";
import type { FrameRate, TestDevice } from "@racer/telemetry/limits";

const SETTINGS_KEY = "rushline.settings.v1";

export interface Settings {
  readonly overlay: boolean;
  readonly recording: boolean;
  readonly automaticUpload: boolean;
  readonly device: TestDevice;
  readonly frameRate: FrameRate;
  readonly noticeSeen: boolean;
  readonly raceData: boolean;
}

const defaultSettings: Settings = {
  automaticUpload: false,
  device: "unspecified",
  frameRate: "60",
  noticeSeen: false,
  overlay: false,
  raceData: true,
  recording: false,
};

const parseSettings = (text: string | null): Settings => {
  if (text === null) {
    return defaultSettings;
  }
  try {
    const fields = new Map(Object.entries(new Object(JSON.parse(text))));
    return {
      automaticUpload: fields.get("automaticUpload") === true,
      device:
        testDevices.find((device) => device === fields.get("device")) ??
        defaultSettings.device,
      frameRate:
        frameRates.find((rate) => rate === fields.get("frameRate")) ??
        defaultSettings.frameRate,
      noticeSeen: fields.get("noticeSeen") === true,
      overlay: fields.get("overlay") === true,
      raceData: fields.get("raceData") !== false,
      recording: fields.get("recording") === true,
    };
  } catch {
    return defaultSettings;
  }
};

export interface RaceDataSwitch {
  readonly sharing: () => boolean;
  readonly watch: (turned: (sharing: boolean) => void) => () => void;
}

export interface SettingsStore {
  readonly read: () => Settings;
  readonly change: (next: Partial<Settings>) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly raceData: RaceDataSwitch;
}

type SettingsDevice = Pick<Storage, "getItem" | "setItem">;

export interface SettingsChanges {
  readonly addEventListener: (
    type: "storage",
    listener: (
      event: Pick<StorageEvent, "key" | "newValue" | "oldValue">
    ) => void
  ) => void;
}

export const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const readText = (device: SettingsDevice | null): string | null => {
  try {
    return device?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
};

const wroteText = (device: SettingsDevice | null, text: string): boolean => {
  if (device === null) {
    return false;
  }
  try {
    device.setItem(SETTINGS_KEY, text);
    return true;
  } catch {
    return false;
  }
};

const listen = <Listener>(
  listeners: Set<Listener>,
  listener: Listener
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const createSettingsStore = (
  device: () => SettingsDevice | null,
  changes: SettingsChanges
): SettingsStore => {
  let seen = readText(device());
  let current = parseSettings(seen);
  const listeners = new Set<() => void>();
  const turns = new Set<(sharing: boolean) => void>();
  const read = (): Settings => {
    const text = readText(device());
    if (text !== seen) {
      seen = text;
      current = parseSettings(text);
    }
    return current;
  };
  const changed = (before: Settings, after: Settings): void => {
    if (before.raceData !== after.raceData) {
      for (const turned of turns) {
        turned(after.raceData);
      }
    }
    for (const listener of listeners) {
      listener();
    }
  };
  changes.addEventListener("storage", ({ key, newValue, oldValue }) => {
    if (key === SETTINGS_KEY || key === null) {
      changed(parseSettings(oldValue), parseSettings(newValue));
    }
  });
  return {
    change(next) {
      const before = read();
      current = { ...before, ...next };
      const text = JSON.stringify(current);
      if (wroteText(device(), text)) {
        seen = text;
      }
      changed(before, current);
    },
    raceData: {
      sharing: () => read().raceData,
      watch: (turned) => listen(turns, turned),
    },
    read,
    subscribe: (listener) => listen(listeners, listener),
  };
};
