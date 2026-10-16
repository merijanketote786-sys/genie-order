import { normalizeConfig } from "@/lib/label-settings";
import { commit, db } from "./store";

type Arg<T> = { data: T } | undefined;
type Scope = "workspace" | "pos";

function scopeOf(arg: Arg<{ scope?: string }>): Scope {
  return arg?.data?.scope === "pos" ? "pos" : "workspace";
}

function read(scope: Scope) {
  const d = db() as any;
  return scope === "pos" ? (d.labelPos ?? d.label) : d.label;
}

export async function getMyLabelSettings(arg?: Arg<{ scope?: string }>) {
  return { config: normalizeConfig(read(scopeOf(arg))) };
}

export async function saveMyLabelSettings(arg: Arg<{ config: unknown; scope?: string }>) {
  const d = db() as any;
  const scope = scopeOf(arg);
  if (scope === "pos") d.labelPos = normalizeConfig(arg?.data?.config);
  else d.label = normalizeConfig(arg?.data?.config);
  commit();
  return { ok: true as const, message: "Label setup saved" };
}
