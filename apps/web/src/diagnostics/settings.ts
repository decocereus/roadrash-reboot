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

export interface SettingsStore {
  readonly read: () => Settings;
  readonly change: (next: Partial<Settings>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

type SettingsDevice = Pick<Storage, "getItem" | "setItem">;

export interface SettingsChanges {
  readonly addEventListener: (
    type: "storage",
    listener: (event: Pick<StorageEvent, "key">) => void
  ) => void;
}

export const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const readStored = (device: SettingsDevice | null): Settings => {
  try {
    return parseSettings(device?.getItem(SETTINGS_KEY) ?? null);
  } catch {
    return defaultSettings;
  }
};

const writeStored = (
  device: SettingsDevice | null,
  settings: Settings
): boolean => {
  try {
    device?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

export const createSettingsStore = (
  device: () => SettingsDevice | null,
  changes: SettingsChanges
): SettingsStore => {
  let current: Settings | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const read = (): Settings => {
    current ??= readStored(device());
    return current;
  };
  changes.addEventListener("storage", ({ key }) => {
    if (key === SETTINGS_KEY || key === null) {
      current = null;
      notify();
    }
  });
  return {
    change(next) {
      current = { ...read(), ...next };
      writeStored(device(), current);
      notify();
    },
    read,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
