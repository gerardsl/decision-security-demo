export const redisMock = {
  counts: new Map<string, number>(),
  configs: [] as { timeout?: number; prefix?: string; tokens?: number; window?: string }[],
  identifiers: [] as string[],
};
