import { normalizeConfig } from "@/lib/label-settings";
import { commit, db } from "./store";

type Arg<T> = { data: T } | undefined;

export async function getMyLabelSettings() {
  return { config: normalizeConfig(db().label) };
}

export async function saveMyLabelSettings(arg: Arg<{ config: unknown }>) {
  const d = db();
  d.label = normalizeConfig(arg?.data?.config);
  commit();
  return { ok: true as const, message: "Label setup saved" };
}
