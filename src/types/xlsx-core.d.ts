// Worker-safe XLSX core bundle (no Node stream/fs requires — SSR crash fix).
declare module "xlsx/dist/xlsx.core.min.js" {
  export function read(data: unknown, opts?: Record<string, unknown>): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  export const utils: {
    sheet_to_csv(ws: unknown, opts?: Record<string, unknown>): string;
    sheet_to_json<T = unknown[]>(ws: unknown, opts?: Record<string, unknown>): T[];
  };
}
