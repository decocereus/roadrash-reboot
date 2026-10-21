export const hasCode = (cause: unknown, code: string) =>
  cause instanceof Error && "code" in cause && cause.code === code;
