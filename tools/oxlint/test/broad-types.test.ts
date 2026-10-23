import { noKnownValueWideningRule } from "../anti-slop/rules/no-known-value-widening.ts";
import { noModuleMockingRule } from "../anti-slop/rules/no-module-mocking.ts";
import { noUnsafeDictionaryTypeRule } from "../anti-slop/rules/no-unsafe-dictionary-type.ts";
import { noWidenThenAssertRule } from "../anti-slop/rules/no-widen-then-assert.ts";
import { runRule } from "./cases.ts";

runRule("anti-slop/no-module-mocking", noModuleMockingRule, {
  invalid: [
    { code: "vi.mock('./db.ts');", errors: [{ messageId: "moduleMock" }] },
    {
      code: "import { vi } from 'vitest'; vi.doMock('./db.ts');",
      errors: [{ messageId: "moduleMock" }],
    },
    {
      code: "import { vi as v } from 'vitest'; v['mock']('./db.ts');",
      errors: [{ messageId: "moduleMock" }],
    },
    {
      code: "import { jest } from '@jest/globals'; jest.unstable_mockModule('./db.ts', () => ({}));",
      errors: [{ messageId: "moduleMock" }],
    },
  ],
  valid: [
    "vi.fn();",
    "import { vi } from './local.ts'; vi.mock('./db.ts');",
    "const vi = { mock() {} }; vi.mock('./db.ts');",
  ],
});

runRule("anti-slop/no-unsafe-dictionary-type", noUnsafeDictionaryTypeRule, {
  invalid: [
    {
      code: "type Bag = Record<string, unknown>;",
      errors: [{ data: { value: "unknown" }, messageId: "unsafeDictionary" }],
    },
    {
      code: "let bag: { [key: string]: any };",
      errors: [{ data: { value: "any" }, messageId: "unsafeDictionary" }],
    },
    {
      code: "type Bag = Readonly<Record<string, object | string>>;",
      errors: [{ data: { value: "union" }, messageId: "unsafeDictionary" }],
    },
    {
      code: "type Loose = {}; type Bag = { [K in string]: Loose };",
      errors: [
        { data: { value: "empty-object" }, messageId: "unsafeDictionary" },
      ],
    },
    {
      code: "type Raw = Record<string, unknown>; function read(bag: Raw) {}",
      errors: [{ column: 11, messageId: "unsafeDictionary" }],
    },
    {
      code: "type Box<T> = Record<string, T>; type Bag = Box<unknown>;",
      errors: [{ messageId: "unsafeDictionary" }],
    },
  ],
  valid: [
    "type Bag = Record<string, number>;",
    "interface Record<K, V> { key: K; value: V } type Bag = Record<string, unknown>;",
    "type Row = { readonly id: string };",
  ],
});

runRule("anti-slop/no-known-value-widening", noKnownValueWideningRule, {
  invalid: [
    {
      code: "const value: unknown = { id: 1 };",
      errors: [
        {
          data: { subject: "binding `value`", target: "unknown" },
          messageId: "widening",
        },
      ],
    },
    {
      code: "const row: { id: number } = { id: 1 };",
      errors: [
        {
          data: { subject: "binding `row`", target: "anonymous object" },
          messageId: "widening",
        },
      ],
    },
    {
      code: "function load(): Record<string, number> { return { a: 1 }; }",
      errors: [
        {
          data: {
            subject: "return value of `load`",
            target: "open dictionary",
          },
          messageId: "widening",
        },
      ],
    },
    {
      code: "const list = [1]; const value: object = list;",
      errors: [
        {
          data: { subject: "binding `value`", target: "object" },
          messageId: "widening",
        },
      ],
    },
    {
      code: "const value = 'a' as unknown;",
      errors: [
        {
          data: { subject: "assertion", target: "unknown" },
          messageId: "widening",
        },
      ],
    },
  ],
  valid: [
    "const counts: Record<string, number> = {};",
    "const value = { id: 1 };",
    "const value: User = { id: 1 };",
    "const value: unknown = load();",
    "let value = 1; value = 2; const other: unknown = value;",
  ],
});

runRule("anti-slop/no-widen-then-assert", noWidenThenAssertRule, {
  invalid: [
    {
      code: "const raw: unknown = { id: 1 }; const row = raw as User;",
      errors: [{ data: { name: "raw" }, messageId: "widenThenAssert" }],
    },
    {
      code: "const raw = [1] as unknown; const list = raw as number[];",
      errors: [{ data: { name: "raw" }, messageId: "widenThenAssert" }],
    },
    {
      code: "const raw: object = [1]; const list = raw as number[];",
      errors: [{ messageId: "widenThenAssert" }],
    },
    {
      code: "const raw: Record<string, unknown> = { a: 1 }; const row = raw as Record<string, number>;",
      errors: [{ messageId: "widenThenAssert" }],
    },
  ],
  valid: [
    "const raw: unknown = load(); const row = raw as User;",
    "const raw: unknown = { id: 1 }; function later() { return raw as User; }",
    "const raw: object = [1]; const row = raw as unknown;",
    "const raw = { id: 1 }; const row = raw as User;",
  ],
});
