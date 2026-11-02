declare const __RUSHLINE_BUILD__: {
  readonly sha: string;
  readonly dirty: boolean;
};

interface ImportMetaEnv {
  readonly VITE_ROOMS_URL: string;
}

declare namespace Cloudflare {
  interface Env {
    readonly ART: R2Bucket;
  }
}
