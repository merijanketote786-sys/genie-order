/** Courier rate files (Excel / CSV / Word) se plain text nikalne wale server-only helpers. */
import { read, utils } from "xlsx";

const MAX_TEXT = 60_000;

export function sheetToText(bytes: Uint8Array): string {
  const wb = read(bytes, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames.slice(0, 8)) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    parts.push(`### Sheet: ${name}\n${utils.sheet_to_csv(ws, { blankrows: false })}`);
  }
  return parts.join("\n\n").slice(0, MAX_TEXT);
}

function u16(b: Uint8Array, i: number) {
  return b[i]! | (b[i + 1]! << 8);
}
function u32(b: Uint8Array, i: number) {
  return (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

/** .docx (zip) me se word/document.xml nikal kar plain text banata hai. */
export async function docxToText(bytes: Uint8Array): Promise<string> {
  let i = 0;
  while (i + 30 <= bytes.length) {
    if (u32(bytes, i) !== 0x04034b50) break;
    const method = u16(bytes, i + 8);
    const compSize = u32(bytes, i + 18);
    const nameLen = u16(bytes, i + 26);
    const extraLen = u16(bytes, i + 28);
    const nameStart = i + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (name === "word/document.xml") {
      if (compSize === 0) break; // streamed entry — not supported
      const raw = bytes.subarray(dataStart, dataStart + compSize);
      const xmlBytes = method === 0 ? raw : await inflateRaw(raw);
      const xml = new TextDecoder().decode(xmlBytes);
      return xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<\/w:tc>/g, "\t")
        .replace(/<\/w:tr>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, MAX_TEXT);
    }
    if (compSize === 0) break;
    i = dataStart + compSize;
  }
  return "";
}
