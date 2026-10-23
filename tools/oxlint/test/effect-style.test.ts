import { noInlineSchemaCompileRule } from "../rushline/rules/no-inline-schema-compile.ts";
import { preferEffectMatchRule } from "../rushline/rules/prefer-effect-match.ts";
import { runRule } from "./cases.ts";

const schema = "import * as Schema from 'effect/Schema';";
const inline = [{ messageId: "inline" }];

runRule("rushline/no-inline-schema-compile", noInlineSchemaCompileRule, {
  invalid: [
    {
      code: `${schema} export const read = (rows) => Schema.decodeUnknownEffect(Row)(rows);`,
      errors: inline,
    },
    {
      code: `${schema} export function check(value) { return Schema.is(Row)(value); }`,
      errors: inline,
    },
    {
      code: `${schema} const Row = Schema.Struct({}); export const read = (rows) => Schema.decodeUnknownSync(Schema.Array(Row))(rows);`,
      errors: inline,
    },
    {
      code: "import { Schema as S } from 'effect'; export const read = (rows) => S.encodeSync(Row)(rows);",
      errors: inline,
    },
  ],
  valid: [
    `${schema} const decodeRow = Schema.decodeUnknownEffect(Row); export const read = (rows) => decodeRow(rows);`,
    `${schema} export const value = Schema.decodeUnknownSync(Row)(input);`,
    `${schema} export const make = (fields) => Schema.Struct(fields);`,
    `${schema} export const rowsOf = (row, rows) => Schema.decodeUnknownEffect(Schema.Array(row))(rows);`,
    "const Schema = { decodeUnknownSync: () => () => 1 }; export const f = () => Schema.decodeUnknownSync(Row)(1);",
  ],
});

runRule("rushline/prefer-effect-match", preferEffectMatchRule, {
  invalid: [
    {
      code: "const label = state === 'a' ? 1 : state === 'b' ? 2 : 3;",
      errors: [{ messageId: "preferMatch" }],
    },
  ],
  valid: [
    "const label = state === 'a' ? 1 : 2;",
    "const label = state === 'a' ? 1 : other === 'b' ? 2 : 3;",
  ],
});
