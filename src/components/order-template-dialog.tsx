import { useEffect, useRef, useState } from "react";
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
import {
  CONFIRMATION_TEMPLATE_VARIABLES,
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_ORDER_TEMPLATE,
  ORDER_TEMPLATE_MAX_LENGTH,
  ORDER_TEMPLATE_VARIABLES,
  type TemplateKind,
} from "@/lib/order-template";

type OrderTemplateDialogProps = {
  template: string;
  onTemplateChange: (template: string) => void;
  compact?: boolean;
  kind?: TemplateKind;
};

export function OrderTemplateDialog({
  template,
  onTemplateChange,
  compact = false,
  kind = "order",
}: OrderTemplateDialogProps) {
  const isConfirm = kind === "confirmation";
  const baseTemplate = isConfirm ? DEFAULT_CONFIRMATION_TEMPLATE : DEFAULT_ORDER_TEMPLATE;
  const variables: readonly { label: string; token: string }[] = isConfirm
    ? CONFIRMATION_TEMPLATE_VARIABLES
    : ORDER_TEMPLATE_VARIABLES;
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
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedName = templates.find((t) => t.id === selectedId)?.name;

  const templateQuery = useQuery({
    queryKey: ["order-template", kind],
    queryFn: () => loadTemplates({ data: { kind } }),
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
    setDraft(baseTemplate);
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

  const startEditDefault = () => {
    setEditingId(null);
    setName("Default");
    setDraft(baseTemplate);
    setFormError(null);
    setEditorOpen(true);
    focusName();
    toast.info("Default template edit mode — tabdeeli ke baad Save dabayein, aapki apni Default ban jayegi");
  };

  const run = async (fn: () => Promise<any>, successMessage: string, fallback: string) => {
    setSaving(true);
    try {
      const result = await fn();
      queryClient.setQueryData(["order-template", kind], result);
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
      () => saveTemplate({ data: { id: editingId ?? undefined, name: cleanName, template: clean, kind } }),
      "Template save ho gayi",
      "Template save nahi ho saki",
    );
    if (result) {
      setEditingId(result.selectedId);
      setEditorOpen(false);
    }
  };

  const handleRowEdit = (row: OrderTemplateRow) => {
    if (editingId === row.id && editorOpen) {
      void handleSave();
      return;
    }
    startEdit(row);
    toast.info(`"${row.name}" khul gayi — tabdeeli ke baad Update dabayein`);
  };

  const insertVariable = (token: string) => {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? draft.length;
    const end = editor?.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`;
    if (next.length > ORDER_TEMPLATE_MAX_LENGTH) {
      toast.error("Template ki maximum length poori ho gayi hai");
      return;
    }
    setDraft(next);
    requestAnimationFrame(() => {
      editor?.focus();
      const cursor = start + token.length;
      editor?.setSelectionRange(cursor, cursor);
    });
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
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          size="sm"
          disabled={loading}
          className={compact ? "relative h-16 w-full min-w-0 flex-col gap-1 rounded-lg px-1.5 text-xs text-muted-foreground sm:h-14 sm:px-2" : undefined}
        >
          <FilePenLine className="size-5 sm:size-4" /> {compact ? "Template" : loading ? "Loading..." : selectedName ? selectedName : "Templates"}
          {compact && selectedName ? <span className="absolute right-2 top-2 size-1.5 rounded-full bg-success" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{isConfirm ? "Confirmation templates" : "Order templates"}</DialogTitle>
          <DialogDescription>
            Multiple templates save karein aur jo chahiye woh select karein. Har naya{" "}
            {isConfirm ? "order performa" : "order"} selected template mein banega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Saved templates</p>
          <div className="space-y-1.5">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                selectedId === null ? "border-primary bg-accent" : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                disabled={saving}
                onClick={() => run(() => resetTemplate({ data: { kind } }), "Default template active", "Default set nahi ho saki")}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {selectedId === null ? <Check className="size-4 shrink-0 text-primary" /> : <span className="size-4 shrink-0" />}
                <span className="truncate font-medium">Default template</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                aria-label="Default template edit karein"
                title="Default template edit karein"
                onClick={startEditDefault}
              >
                <FilePenLine />
              </Button>
            </div>

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
                  onClick={() => run(() => pickTemplate({ data: { id: row.id, kind } }), `"${row.name}" select ho gayi`, "Select nahi ho saki")}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {row.id === selectedId ? <Check className="size-4 shrink-0 text-primary" /> : <span className="size-4 shrink-0" />}
                  <span className="truncate font-medium">{row.name}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  aria-label={`"${row.name}" edit karein`}
                  title="Edit template"
                  onClick={() => handleRowEdit(row)}
                >
                  {editingId === row.id && editorOpen ? <Save /> : <FilePenLine />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => run(() => removeTemplate({ data: { id: row.id, kind } }), "Template delete ho gayi", "Delete nahi ho saki")}
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

        {editorOpen ? (
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
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Variables — touch karke cursor par add karein</p>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
              {variables.map((variable) => (
                <Button
                  key={variable.token}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertVariable(variable.token)}
                  className="h-8 rounded-md bg-card px-2.5 text-[11px]"
                  title={`${variable.token} insert karein`}
                >
                  {variable.label}
                </Button>
              ))}
            </div>
          </div>
          <Textarea
            ref={editorRef}
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
        ) : null}


        <DialogFooter className="sticky bottom-0 -mx-4 gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-6 sm:space-x-0 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => run(() => resetTemplate({ data: { kind } }), "Default template active", "Default set nahi ho saki")}
            disabled={saving || selectedId === null}
          >
            <RotateCcw /> Default template
          </Button>
          {editorOpen ? (
            <Button type="button" onClick={handleSave} disabled={saving}>
              <Save /> {saving ? "Saving..." : editingId ? "Update template" : "Save template"}
            </Button>
          ) : (
            <Button type="button" onClick={startNew} disabled={saving}>
              <Plus /> Nayi template
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
