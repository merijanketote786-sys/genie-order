import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type WorkspaceHeaderProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  meta?: string[];
  className?: string;
};

export function WorkspaceHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  meta = [],
  className,
}: WorkspaceHeaderProps) {
  return (
    <section className={cn("shrink-0 border-b border-border py-3 sm:py-6", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm sm:size-11">
            <Icon className="size-4.5 sm:size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-primary sm:text-[11px]">{eyebrow}</p>
            <h2 className="font-display text-lg font-bold text-foreground sm:mt-1 sm:text-2xl">{title}</h2>
            <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-muted-foreground sm:block">{description}</p>
          </div>
        </div>
        {meta.length ? (
          <div className="hidden shrink-0 flex-wrap justify-end gap-2 md:flex">
            {meta.map((item) => (
              <span key={item} className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}