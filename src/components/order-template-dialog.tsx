import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FilePenLine, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteOrderTemplate,
  getOrderTemplate,
  resetOrderTemplate,
  saveOrderTemplate,
  selectOrderTemplate,
  type OrderTemplateRow,
} from "@/lib/order-template.functions";
import { DEFAULT_ORDER_TEMPLATE, ORDER_TEMPLATE_MAX_LENGTH } from "@/lib/order-template";

type OrderTemplateDialogProps = {
  template: string;
  onTemplateChange: (template: string) => void;
};

export function OrderTemplateDialog({ template, onTemplateChange }: OrderTemplateDialogProps) {
  const queryClient = useQueryClient();
  const loadTemplates = useServerFn(getOrderTemplate);
  const saveTemplate = useServerFn(saveOrderTemplate);
  const pickTemplate = useServerFn(selectOrderTemplate);
  const removeTemplate = useServerFn(deleteOrderTemplate);
  const resetTemplate = useServerFn(resetOrderTemplate);

  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<OrderTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState(template);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedName = templates.find((t) => t.id === selectedId)?.name;

  const templateQuery = useQuery({
    queryKey: ["order-template"],
    queryFn: () => loadTemplates(),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });

  const applyResult = (result: {
    templates: OrderTemplateRow[];
    selectedId: string | null;
    template: string;
  }) => {
    setTemplates(result.templates);
    setSelectedId(result.selectedId);
    onTemplateChange(result.template);
  };

  useEffect(() => {
    if (!templateQuery.data) return;
    applyResult(templateQuery.data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateQuery.data]);

  useEffect(() => {
    if (!templateQuery.isError) return;
    setLoading(false);
    toast.error("Order templates load nahi ho sakin");
  }, [templateQuery.isError]);

  const focusName = () => {
    requestAnimationFrame(() => {
      const input = document.getElementById("order-template-name") as HTMLInputElement | null;
      input?.scrollIntoView({ block: "center", behavior: "smooth" });
      input?.focus();
    });
  };

  const startNew = () => {
    setEditingId(null);
    setName("");
    setDraft(DEFAULT_ORDER_TEMPLATE);
    setFormError(null);
    setEditorOpen(true);
    focusName();
  };

  const startEdit = (row: OrderTemplateRow) => {
    setEditingId(row.id);
    setName(row.name);
    setDraft(row.template);
    setFormError(null);
    setEditorOpen(true);
    focusName();
  };

  const run = async (fn: () => Promise<any>, successMessage: string, fallback: string) => {
    setSaving(true);
    try {
      const result = await fn();
      queryClient.setQueryData(["order-template"], result);
      applyResult(result);
      setFormError(null);
      toast.success(successMessage);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : fallback;
      setFormError(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const clean = draft.trim();
    if (cleanName.length < 2) {
      setFormError("Template ka naam likhein");
      toast.error("Template ka naam likhein");
      document.getElementById("order-template-name")?.focus();
      return;
    }
    if (clean.length < 10) {
      setFormError("Template mein kam az kam ek mukammal field likhein");
      toast.error("Template mein kam az kam ek mukammal field likhein");
      return;
    }
    const result = await run(
      () => saveTemplate({ data: { id: editingId ?? undefined, name: cleanName, template: clean } }),
      "Template save ho gayi",
      "Template save nahi ho saki",
    );
    if (result) {
      setEditingId(result.selectedId);
      setEditorOpen(false);
    }
  };

  const handleRowSave = (row: OrderTemplateRow) => {
    if (editingId === row.id && editorOpen) {
      void handleSave();
      return;
    }
    startEdit(row);
    toast.info("Template khul gayi — tabdeeli ke baad Save dabayein");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEditorOpen(false);
          setFormError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={loading}>
          <FilePenLine /> {loading ? "Loading..." : selectedName ? selectedName : "Templates"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Order templates</DialogTitle>
          <DialogDescription>
            Multiple templates save karein aur jo chahiye woh select karein. Har naya order selected template mein banega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Saved templates</p>
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => run(() => resetTemplate(), "Default template active", "Default set nahi ho saki")}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${
                selectedId === null ? "border-primary bg-accent" : "border-border bg-card"
              }`}
            >
              {selectedId === null ? <Check className="size-4 text-primary" /> : <span className="size-4" />}
              <span className="font-medium">Default template</span>
            </button>

            {templates.map((row) => (
              <div
                key={row.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  row.id === selectedId ? "border-primary bg-accent" : "border-border bg-card"
                }`}
              >
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => run(() => pickTemplate({ data: { id: row.id } }), `"${row.name}" select ho gayi`, "Select nahi ho saki")}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {row.id === selectedId ? <Check className="size-4 shrink-0 text-primary" /> : <span className="size-4 shrink-0" />}
                  <span className="truncate font-medium">{row.name}</span>
                </button>
                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => startEdit(row)}>
                  <FilePenLine />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => run(() => removeTemplate({ data: { id: row.id } }), "Template delete ho gayi", "Delete nahi ho saki")}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={startNew} disabled={saving}>
            <Plus /> Nayi template
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <label htmlFor="order-template-name" className="text-sm font-semibold text-foreground">
            {editingId ? "Template edit karein" : "Nayi template"}
          </label>
          <Input
            id="order-template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            disabled={saving}
            placeholder="Template ka naam (jaise: COD orders)"
            className="rounded-xl bg-card"
          />
          <Textarea
            id="order-template"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={ORDER_TEMPLATE_MAX_LENGTH}
            disabled={saving}
            className="min-h-60 resize-y rounded-xl bg-card font-mono text-base leading-6 sm:text-sm"
          />
          <p className="text-right text-xs text-muted-foreground">
            {draft.length}/{ORDER_TEMPLATE_MAX_LENGTH}
          </p>
          {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter className="sticky bottom-0 -mx-4 gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-6 sm:space-x-0 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => run(() => resetTemplate(), "Default template active", "Default set nahi ho saki")}
            disabled={saving || selectedId === null}
          >
            <RotateCcw /> Default template
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            <Save /> {saving ? "Saving..." : editingId ? "Update template" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
