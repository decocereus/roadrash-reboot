import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const browserModes = ["headless", "windowed"] as const;

export type BrowserMode = (typeof browserModes)[number];

const browserHostIds = ["macos-metal", "linux-nvidia", "linux-intel"] as const;

export type BrowserHostId = (typeof browserHostIds)[number];

export const browserHostId = Schema.Literals(browserHostIds);

export const HOST_SETTING = "RUSHLINE_BROWSER_HOST";

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

type WindowedLauncher =
  | { readonly app: string; readonly kind: "open" }
  | { readonly binary: string; readonly kind: "direct" };

export interface ListenerProbe {
  readonly args: (port: number) => readonly string[];
  readonly file: string;
  readonly pidIn: (stdout: string) => number | null;
}

interface DisplayProbe {
  readonly args: readonly string[];
  readonly file: string;
  readonly keep: RegExp;
}

type DesktopNeed = "none" | "hyprland";

export interface DesktopEnv {
  readonly DISPLAY?: string;
}

interface HostPage {
  readonly dpr: number;
  readonly height: number;
  readonly width: number;
}

export interface BrowserHost {
  readonly desktop: DesktopNeed;
  readonly displayProbes: readonly DisplayProbe[];
  readonly headless: {
    readonly binary: string;
    readonly env: Readonly<Record<string, string>>;
    readonly flags: readonly string[];
  };
  readonly id: BrowserHostId;
  readonly listener: ListenerProbe;
  readonly page: HostPage | null;
  readonly perfEnvironment: string;
  readonly platform: NodeJS.Platform;
  readonly processMark: string;
  readonly rendererMark: string;
  readonly windowed: {
    readonly env: Readonly<Record<string, string>>;
    readonly flags: readonly string[];
    readonly launcher: WindowedLauncher;
    readonly viewport: Viewport;
  };
}

const lsof: ListenerProbe = {
  args: (port) => ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"],
  file: "lsof",
  pidIn: (stdout) => stdout.split("\n").filter(Boolean).map(Number)[0] ?? null,
};

const ss: ListenerProbe = {
  args: (port) => ["-ltnpH", `sport = :${port}`],
  file: "ss",
  pidIn: (stdout) => {
    const pid = /pid=(?<pid>\d+)/u.exec(stdout)?.groups?.pid;
    return pid === undefined ? null : Number(pid);
  },
};

const METAL_FLAGS = [
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
] as const;

const CHROMIUM = "/usr/lib/chromium/chromium";

const HYPRCTL_MONITORS: DisplayProbe = {
  args: ["-i", "0", "monitors"],
  file: "hyprctl",
  keep: /^(?:Monitor |\d+x\d+@|scale:|vrr:|dpmsStatus:)/u,
};

const RETINA_WINDOW: Viewport = { height: 860, scale: 2, width: 1512 };

export const browserHosts = {
  "linux-intel": {
    desktop: "hyprland",
    displayProbes: [HYPRCTL_MONITORS],
    headless: {
      binary: CHROMIUM,
      env: {},
      flags: [
        "--use-gl=angle",
        "--use-angle=gl-egl",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
      ],
    },
    id: "linux-intel",
    listener: ss,
    page: null,
    perfEnvironment: "gpu-chromium-intel",
    platform: "linux",
    processMark: "chromium",
    rendererMark: "Intel",
    windowed: {
      env: {},
      flags: [
        "--ozone-platform=x11",
        "--use-gl=angle",
        "--use-angle=gl",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--disable-features=BackForwardCache",
        "--start-fullscreen",
      ],
      launcher: { binary: CHROMIUM, kind: "direct" },
      viewport: { height: 1080, scale: 1, width: 1920 },
    },
  },
  "linux-nvidia": {
    desktop: "hyprland",
    displayProbes: [
      HYPRCTL_MONITORS,
      {
        args: [
          "--query-gpu=name,driver_version,power.limit,pstate",
          "--format=csv,noheader",
        ],
        file: "nvidia-smi",
        keep: /./u,
      },
    ],
    headless: {
      binary: CHROMIUM,
      env: {
        __EGL_VENDOR_LIBRARY_FILENAMES:
          "/usr/share/glvnd/egl_vendor.d/10_nvidia.json",
      },
      flags: [
        "--use-gl=angle",
        "--use-angle=gl-egl",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
      ],
    },
    id: "linux-nvidia",
    listener: ss,
    page: { dpr: 2, height: 773, width: 1512 },
    perfEnvironment: "gpu-chromium-nvidia",
    platform: "linux",
    processMark: "chromium",
    rendererMark: "NVIDIA",
    windowed: {
      env: {
        __GLX_VENDOR_LIBRARY_NAME: "nvidia",
        __NV_PRIME_RENDER_OFFLOAD: "1",
        __VK_LAYER_NV_optimus: "NVIDIA_only",
      },
      flags: [
        "--ozone-platform=x11",
        "--use-gl=angle",
        "--use-angle=gl",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--force-device-scale-factor=2",
        "--disable-features=BackForwardCache",
      ],
      launcher: { binary: CHROMIUM, kind: "direct" },
      viewport: RETINA_WINDOW,
    },
  },
  "macos-metal": {
    desktop: "none",
    displayProbes: [
      {
        args: ["SPDisplaysDataType"],
        file: "system_profiler",
        keep: /^(?:Chipset Model|Display Type|Resolution|UI Looks like|Main Display|Refresh)/u,
      },
    ],
    headless: {
      binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      env: {},
      flags: METAL_FLAGS,
    },
    id: "macos-metal",
    listener: lsof,
    page: null,
    perfEnvironment: "gpu-helium-metal",
    platform: "darwin",
    processMark: "Helium",
    rendererMark: "Metal",
    windowed: {
      env: {},
      flags: METAL_FLAGS,
      launcher: { app: "/Applications/Helium.app", kind: "open" },
      viewport: RETINA_WINDOW,
    },
  },
} as const satisfies Readonly<Record<BrowserHostId, BrowserHost>>;

export const perfEnvironments: readonly string[] = browserHostIds.map(
  (id) => browserHosts[id].perfEnvironment
);

const decodeHostId = Schema.decodeUnknownOption(browserHostId);

const chosenHost = (
  platform: NodeJS.Platform,
  setting: string
): BrowserHost => {
  const id = Option.getOrNull(decodeHostId(setting));
  if (id === null) {
    throw new Error(
      `Unknown ${HOST_SETTING}=${setting}; use ${browserHostIds.join(", ")}.`
    );
  }
  const host = browserHosts[id];
  if (host.platform !== platform) {
    throw new Error(
      `${HOST_SETTING}=${setting} runs on ${host.platform}, and this machine is ${platform}.`
    );
  }
  return host;
};

export const hostOf = (
  platform: NodeJS.Platform,
  setting?: string
): BrowserHost => {
  if (setting !== undefined && setting !== "") {
    return chosenHost(platform, setting);
  }
  if (platform === "darwin") {
    return browserHosts["macos-metal"];
  }
  if (platform === "linux") {
    return browserHosts["linux-nvidia"];
  }
  throw new Error(
    `No browser host for ${platform}; the rows in packages/devtools/src/browser-host.ts cover darwin and linux.`
  );
};

export class CurrentHost extends Context.Service<CurrentHost, BrowserHost>()(
  "@racer/devtools/CurrentHost"
) {
  static readonly chosen = () =>
    Layer.succeed(CurrentHost)(
      hostOf(process.platform, process.env[HOST_SETTING])
    );
}
