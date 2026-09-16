/** PostgREST .or() filter ke liye user input ko safe banata hai. */
export function likeTerm(raw: string): string {
  const clean = raw.replace(/[%(),."\\]/g, "").trim().slice(0, 80);
  return `%${clean}%`;
}
