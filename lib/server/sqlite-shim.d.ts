declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path?: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
  export class StatementSync {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }
  export function backup(
    source: DatabaseSync,
    target: DatabaseSync,
    options?: { pagesPerIteration?: number },
  ): void;
}
