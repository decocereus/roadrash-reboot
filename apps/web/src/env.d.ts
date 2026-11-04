declare const __RUSHLINE_BUILD__: {
  readonly rooms: string;
  readonly sha: string;
  readonly dirty: boolean;
};

interface ImportMetaEnv {
  readonly VITE_ROOMS_URL: string;
}

declare namespace Cloudflare {
  interface Env {
    readonly ART: R2Bucket;
    readonly POSTHOG_PROJECT_KEY: string;
  }
}
