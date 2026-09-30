import { useState } from "react";
import { Menu, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminWorkspaceSettings } from "@/components/admin-workspace-settings";

/** Admin-only 3-bar menu that opens the Users & feature access popup. */
export function FeatureAccessMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-10 shrink-0 border-border bg-card" title="Admin menu" aria-label="Admin menu">
            <Menu className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Admin</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setOpen(true)} className="gap-2">
            <SlidersHorizontal className="size-4" /> Feature access
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] w-full overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Feature access</DialogTitle>
            <DialogDescription>Choose which sections and POS features each user can use.</DialogDescription>
          </DialogHeader>
          {open ? <AdminWorkspaceSettings usersOnly /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
