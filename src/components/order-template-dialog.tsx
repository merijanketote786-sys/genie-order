import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePenLine, RotateCcw, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  getOrderTemplate,
  resetOrderTemplate,
  saveOrderTemplate,
} from "@/lib/order-template.functions";
import { DEFAULT_ORDER_TEMPLATE, ORDER_TEMPLATE_MAX_LENGTH } from "@/lib/order-template";

type OrderTemplateDialogProps = {
  template: string;
  onTemplateChange: (template: string) => void;
};

export function OrderTemplateDialog({ template, onTemplateChange }: OrderTemplateDialogProps) {
  const loadTemplate = useServerFn(getOrderTemplate);
  const saveTemplate = useServerFn(saveOrderTemplate);
  const resetTemplate = useServerFn(resetOrderTemplate);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(template);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isCustom = template !== DEFAULT_ORDER_TEMPLATE;

  // Cached across pages/navigations — ek hi request, baar baar nahi
  const templateQuery = useQuery({
    queryKey: ["order-template"],
    queryFn: () => loadTemplate(),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });

  useEffect(() => {
    if (!templateQuery.data) return;
    onTemplateChange(templateQuery.data.template);
    setDraft(templateQuery.data.template);
    setLoading(false);
  }, [templateQuery.data, onTemplateChange]);

  useEffect(() => {
    if (!templateQuery.isError) return;
    setLoading(false);
    toast.error("Order template load nahi ho saki");
  }, [templateQuery.isError]);

  useEffect(() => setDraft(template), [template]);

  const handleSave = async () => {
    const clean = draft.trim();
    if (clean.length < 10) {
      toast.error("Template mein kam az kam ek mukammal field likhein");
      return;
    }
    setSaving(true);
    try {
      const result = await saveTemplate({ data: { template: clean } });
      onTemplateChange(result.template);
      setOpen(false);
      toast.success("Order template save ho gayi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template save nahi ho saki");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const result = await resetTemplate();
      onTemplateChange(result.template);
      setDraft(result.template);
      setOpen(false);
      toast.success("Default template wapas lag gayi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template reset nahi ho saki");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={loading}>
          <FilePenLine /> {loading ? "Loading..." : isCustom ? "Custom template" : "Template"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Order template</DialogTitle>
          <DialogDescription>
            Fields ka naam aur sequence apni marzi se likhein. Har naya order isi layout mein banega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="order-template" className="text-sm font-semibold text-foreground">
            Aapka format
          </label>
          <Textarea
            id="order-template"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={ORDER_TEMPLATE_MAX_LENGTH}
            disabled={saving}
            className="min-h-72 resize-y rounded-xl bg-card font-mono text-base leading-6 sm:text-sm"
          />
          <p className="text-right text-xs text-muted-foreground">
            {draft.length}/{ORDER_TEMPLATE_MAX_LENGTH}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={handleReset} disabled={saving || !isCustom}>
            <RotateCcw /> Default template
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || draft.trim().length < 10}>
            <Save /> {saving ? "Saving..." : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}