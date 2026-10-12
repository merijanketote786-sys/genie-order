import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const EXTRACT_EXTENSIONS = ["xlsx", "xls", "csv", "txt", "docx"];

/** Excel / CSV / Word / TXT file se text nikalta hai — bina AI. */
export const extractFileText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fileName: z.string().min(1).max(260), dataUrl: z.string().min(1).max(20_000_000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const ext = (data.fileName.split(".").pop() ?? "").toLowerCase();
    if (!EXTRACT_EXTENSIONS.includes(ext)) throw new Error("Upload an Excel, CSV, Word (.docx) or TXT file");
    const base64 = data.dataUrl.includes(",") ? data.dataUrl.split(",")[1]! : data.dataUrl;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const doc = await import("@/lib/courier-doc.server");
    let text = "";
    if (ext === "docx") text = await doc.docxToText(bytes);
    else if (ext === "txt") text = new TextDecoder().decode(bytes).slice(0, 60_000);
    else text = doc.sheetToText(bytes);
    return { text: text.trim() || "No readable text found in this file." };
  });
