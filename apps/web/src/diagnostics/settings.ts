import { testDevices } from "@racer/telemetry/limits";
import type { TestDevice } from "@racer/telemetry/limits";

export const SETTINGS_KEY = "rushline.settings.v1";

export interface Settings {
  readonly overlay: boolean;
  readonly recording: boolean;
  readonly automaticUpload: boolean;
  readonly device: TestDevice;
}

export const defaultSettings: Settings = {
  automaticUpload: false,
  device: "unspecified",
  overlay: false,
  recording: false,
};

export const parseSettings = (text: string | null): Settings => {
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
      overlay: fields.get("overlay") === true,
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

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const readStored = (): Settings => {
  try {
    return parseSettings(storage()?.getItem(SETTINGS_KEY) ?? null);
  } catch {
    return defaultSettings;
  }
};

const writeStored = (settings: Settings): boolean => {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

export const createSettingsStore = (): SettingsStore => {
  let current: Settings | null = null;
  const listeners = new Set<() => void>();
  const read = (): Settings => {
    current ??= readStored();
    return current;
  };
  return {
    change(next) {
      current = { ...read(), ...next };
      writeStored(current);
      for (const listener of listeners) {
        listener();
      }
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
