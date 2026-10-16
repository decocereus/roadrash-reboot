import type { WebEnv } from "../../../alchemy.run.ts";

declare module "cloudflare:workers" {
  namespace Cloudflare {
    // oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- module augmentation merges WebEnv into Env
    interface Env extends WebEnv {}
  }
}

declare global {
  const __RUSHLINE_BUILD__: { readonly sha: string; readonly dirty: boolean };
}
