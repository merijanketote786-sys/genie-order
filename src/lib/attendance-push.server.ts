/** Biometric machine push helpers (ZKTeco ADMS / iClock protocol + generic JSON). */
type Punch = { bioId: string; day: string; tm: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function findDevice(by: { serial?: string | null; token?: string | null }) {
  const sb = await admin();
  let q = sb.from("att_devices").select("id, workspace_id");
  if (by.token) q = q.eq("token", by.token);
  else if (by.serial) q = q.eq("serial", by.serial.toUpperCase());
  else return null;
  const { data } = await q.maybeSingle();
  if (data) await sb.from("att_devices").update({ last_seen: new Date().toISOString() }).eq("id", data.id);
  return data as { id: string; workspace_id: string } | null;
}

export function parseAttLog(body: string): Punch[] {
  const out: Punch[] = [];
  for (const line of body.split(/\r?\n/)) {
    const parts = line.trim().split(/\t+/);
    if (parts.length < 2) continue;
    const pin = parts[0].replace(/^PIN=/, "").trim();
    const m = parts[1].match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (pin && m) out.push({ bioId: pin, day: m[1], tm: m[2].length === 5 ? `${m[2]}:00` : m[2] });
  }
  return out;
}

export async function savePunches(dev: { id: string; workspace_id: string }, punches: Punch[], source: string) {
  if (!punches.length) return 0;
  const sb = await admin();
  const rows = punches.slice(0, 5000).map((p) => ({ workspace_id: dev.workspace_id, device_id: dev.id, bio_id: p.bioId.slice(0, 40), day: p.day, tm: p.tm, source }));
  const { error } = await sb.from("att_punches").upsert(rows, { onConflict: "workspace_id,bio_id,day,tm", ignoreDuplicates: true });
  if (error) console.error("attendance push save failed", error.message);
  return rows.length;
}

export const text = (s: string, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/plain" } });

export function optionsReply(sn: string) {
  return [
    `GET OPTION FROM: ${sn}`, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None", "ErrorDelay=30", "Delay=10",
    "TransTimes=00:00;14:05", "TransInterval=1", "TransFlag=TransData AttLog", "TimeZone=5", "Realtime=1", "Encrypt=None",
  ].join("\n");
}
