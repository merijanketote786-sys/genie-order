import { findDevice, optionsReply, parseAttLog, savePunches, text } from "@/lib/attendance-push.server";

const tokenOf = (u: URL, pathToken?: string) => pathToken ?? u.searchParams.get("token") ?? "";

export async function iclockCdataGet(request: Request, pathToken?: string) {
  const u = new URL(request.url);
  const sn = u.searchParams.get("SN") ?? "";
  const dev = await findDevice({ serial: sn, token: tokenOf(u, pathToken) });
  if (!dev) return text("Unknown device", 403);
  return text(optionsReply(sn));
}

export async function iclockCdataPost(request: Request, pathToken?: string) {
  const u = new URL(request.url);
  const sn = u.searchParams.get("SN") ?? "";
  const dev = await findDevice({ serial: sn, token: tokenOf(u, pathToken) });
  if (!dev) return text("Unknown device", 403);
  const body = (await request.text()).slice(0, 2_000_000);
  if ((u.searchParams.get("table") ?? "").toUpperCase() !== "ATTLOG") return text("OK");
  const n = await savePunches(dev, parseAttLog(body), "device");
  return text(`OK: ${n}`);
}

export async function iclockGetRequest(request: Request, pathToken?: string) {
  const u = new URL(request.url);
  const dev = await findDevice({ serial: u.searchParams.get("SN") ?? "", token: tokenOf(u, pathToken) });
  if (!dev) return text("Unknown device", 403);
  return text("OK");
}
