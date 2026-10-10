import type { CnFunction } from "cn";
import { createCn } from "cn/config";

export const cn: CnFunction = createCn({
  extend: {
    theme: {
      spacing: ["gutter", "panel", "strip"],
      text: ["outcome", "hud", "heading", "name", "quote", "body", "label"],
      tracking: ["display", "label"],
    },
  },
});
