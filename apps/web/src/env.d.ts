declare const __RUSHLINE_BUILD__: {
  readonly sha: string;
  readonly dirty: boolean;
};

declare namespace Cloudflare {
  interface Env {
    readonly ART: R2Bucket;
  }
}
