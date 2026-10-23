declare module "postcss/lib/tokenize" {
  import type { Input } from "postcss";

  type Token = readonly [kind: string, content: string, start?: number];

  interface Tokenizer {
    readonly endOfFile: () => boolean;
    readonly nextToken: () => Token;
  }

  export default function tokenizer(input: Input): Tokenizer;
}
