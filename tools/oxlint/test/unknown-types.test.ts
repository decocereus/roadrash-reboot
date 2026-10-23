import { noObjectParametersRule } from "../anti-slop/rules/no-object-parameters.ts";
import { noUnknownParametersRule } from "../anti-slop/rules/no-unknown-parameters.ts";
import { noUnknownReturnsRule } from "../anti-slop/rules/no-unknown-returns.ts";
import { noUnknownTypeAliasesRule } from "../anti-slop/rules/no-unknown-type-aliases.ts";
import { runRule } from "./cases.ts";

runRule("anti-slop/no-unknown-type-aliases", noUnknownTypeAliasesRule, {
  invalid: [
    {
      code: "type Payload = unknown;",
      errors: [{ data: { alias: "Payload" }, messageId: "unknownAlias" }],
    },
    {
      code: "type Raw = unknown; export type Payload = (Raw);",
      errors: [
        { data: { alias: "Raw" }, messageId: "unknownAlias" },
        { data: { alias: "Payload" }, messageId: "unknownAlias" },
      ],
    },
  ],
  valid: [
    "type Payload = { readonly id: string };",
    "type Box<T> = T; type Payload = Box<unknown>;",
    "type Loop = Loop;",
  ],
});

runRule("anti-slop/no-unknown-parameters", noUnknownParametersRule, {
  invalid: [
    {
      code: "function parse(input: unknown) {}",
      errors: [{ data: { parameter: "input" }, messageId: "unknownParameter" }],
    },
    {
      code: "const f = (...rest: unknown) => rest;",
      errors: [{ data: { parameter: "rest" }, messageId: "unknownParameter" }],
    },
    {
      code: "type Handler = (event: unknown) => void;",
      errors: [{ data: { parameter: "event" }, messageId: "unknownParameter" }],
    },
    {
      code: "class A { constructor(private readonly raw: unknown) {} }",
      errors: [{ data: { parameter: "raw" }, messageId: "unknownParameter" }],
    },
    {
      code: "interface Port { send(message: unknown): void }",
      errors: [{ messageId: "unknownParameter" }],
    },
  ],
  valid: [
    "function wrap(cause: unknown) {}",
    "function parse(input: string) {}",
    "const f = (input: unknown[]) => input;",
  ],
});

runRule("anti-slop/no-unknown-returns", noUnknownReturnsRule, {
  invalid: [
    {
      code: "function read(): unknown {}",
      errors: [{ messageId: "unknownReturn" }],
    },
    {
      code: "const read = async (): Promise<unknown> => value;",
      errors: [{ messageId: "unknownReturn" }],
    },
    {
      code: "type Raw = unknown; function read(): Raw | null {}",
      errors: [{ messageId: "unknownReturn" }],
    },
    {
      code: "interface Port { read(): PromiseLike<unknown> }",
      errors: [{ messageId: "unknownReturn" }],
    },
  ],
  valid: [
    "function read(): string {}",
    "function read(): Promise<string> {}",
    "type Raw = unknown; function read<Raw>(): Raw {}",
    "function read(): unknown[] {}",
  ],
});

runRule("anti-slop/no-object-parameters", noObjectParametersRule, {
  invalid: [
    {
      code: "function save(row: object) {}",
      errors: [{ data: { parameter: "row" }, messageId: "objectParameter" }],
    },
    {
      code: "type Loose = object | null; const save = (row: Loose) => row;",
      errors: [{ data: { parameter: "row" }, messageId: "objectParameter" }],
    },
    {
      code: "function save(row: object = {}) {}",
      errors: [{ messageId: "objectParameter" }],
    },
  ],
  valid: [
    "function save(row: { readonly id: string }) {}",
    "type Loose = object; function save<Loose>(row: Loose) {}",
    "function save(rows: object[]) {}",
  ],
});
