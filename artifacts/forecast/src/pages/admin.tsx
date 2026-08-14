import React, { useState, useMemo } from "react";
import { 
  useAdminListMarkets, 
  useCreateMarket, 
  useResolveMarket,
  usePatchMarket,
  useListMarketTemplates,
  useCreateMarketFromTemplate,
  useUpdateMarketTemplate,
  useDeleteMarketTemplate,
  getAdminListMarketsQueryKey,
  getListMarketsQueryKey,
  getGetTrendingMarketsQueryKey,
  getListMarketTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getCategoryLabel } from "@/lib/categories";
import { Shield, CheckCircle2, XCircle, Crown, Plus, Trash2, Layers, Pencil, ChevronLeft, Copy, Check, Search, X } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { buildDescriptionPreview } from "@/lib/admin-preview";
import { PreviewJsonPanel } from "@/lib/preview-json-panel";

const ALL_CATEGORIES = ["STYLE", "HOME", "CITY", "REAL_ESTATE", "WEATHER", "CULTURE", "LOCAL_PULSE", "BEAUTY", "ACCESSORIES", "MOVIES"] as const;
const ALL_FORMATS = ["STANDARD", "HOT_OR_NOT", "HEAD_TO_HEAD", "MULTI_CHOICE", "BUZZ_OR_BOO", "THE_CALL"] as const;
const ALL_CLOCK_TYPES = ["EVERGREEN", "SEASONAL", "NOW", "EVENT_DRIVEN", "ROLLING_FORECAST", "RECURRING_PULSE"] as const;

const CLOCK_TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  EVERGREEN:        { label: "🌿 Evergreen",        hint: "Never expires — always relevant" },
  SEASONAL:         { label: "🌸 Seasonal",          hint: "Active for a specific season or window" },
  NOW:              { label: "⚡ Now",               hint: "Aggressive expiry — hyper-current moment" },
  EVENT_DRIVEN:     { label: "📅 Event-Driven",      hint: "Closes when the event resolves" },
  ROLLING_FORECAST: { label: "🔄 Rolling Forecast",  hint: "Window advances on a schedule" },
  RECURRING_PULSE:  { label: "🔁 Recurring Pulse",   hint: "Auto-respawns on a cadence" },
};

const ENGINE_LABELS: Record<string, string> = {
  STANDARD:     "Standard (YES / NO)",
  HOT_OR_NOT:   "Hot or Not",
  HEAD_TO_HEAD: "Head to Head",
  MULTI_CHOICE: "👑 Buzz Battle",
  BUZZ_OR_BOO:  "⚡ Buzz or Boo",
  THE_CALL:     "🎯 The Call",
};

const formSchema = z.object({
  title: z.string().min(5),
  question: z.string().min(10),
  category: z.enum(ALL_CATEGORIES),
  marketFormat: z.enum(ALL_FORMATS).default("STANDARD"),
  subcategory: z.string().min(2),
  imageUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  resolutionSource: z.string().optional(),
  sourcePrimary: z.string().optional(),
  sourceBackup: z.string().optional(),
  baselineSnapshot: z.string().optional(),
  formula: z.string().optional(),
  voidRule: z.string().optional(),
  geo: z.string().optional(),
  closesAt: z.string().optional(),
  clockType: z.enum(ALL_CLOCK_TYPES).default("EVERGREEN"),
  publishAt: z.string().optional(),
  peakUntil: z.string().optional(),
  expireAt: z.string().optional(),
  refreshRule: z.string().optional(),
});

// Template-based market creation form schema
const templateMarketSchema = z.object({
  title: z.string().min(5),
  filledQuestion: z.string().min(10),
  subcategory: z.string().min(2),
  imageUrl: z.string().url().optional().or(z.literal("")),
  closesAt: z.string().optional(),
  geo: z.string().optional(),
});

interface Contender {
  key: string;
  name: string;
  venue: string;
}

interface MultiChoiceContender {
  key: string;
  name: string;
  venue?: string;
}

function parseContenders(description: string | null | undefined): MultiChoiceContender[] {
  if (!description) return [];
  try {
    const parsed = JSON.parse(description);
    if (Array.isArray(parsed.contenders)) return parsed.contenders;
  } catch {}
  return [];
}

const CONTENDER_KEYS = ["A", "B", "C", "D", "E"];

// Extract [PLACEHOLDER] slots from a template question string
function extractPlaceholders(templateQuestion: string): string[] {
  const matches = templateQuestion.match(/\[([^\]]+)\]/g) ?? [];
  return [...new Set(matches)]; // dedupe
}

// Fill placeholder slots into a template question
function fillPlaceholders(templateQuestion: string, values: Record<string, string>): string {
  return templateQuestion.replace(/\[([^\]]+)\]/g, (match, key) => values[match] ?? match);
}
interface EditMarketFormProps {
  market: {
    id: number;
    title: string;
    question: string;
    description?: string | null;
    subcategory: string;
    imageUrl?: string | null;
    geo?: string | null;
    closesAt?: string | null;
    resolutionSource?: string | null;
    sourcePrimary?: string | null;
    sourceBackup?: string | null;
    baselineSnapshot?: string | null;
    formula?: string | null;
    voidRule?: string | null;
    marketFormat?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

function EditMarketForm({ market, onClose, onSuccess }: EditMarketFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const patchMarket = usePatchMarket();
  const [isSaving, setIsSaving] = useState(false);

  const isMultiChoice = market.marketFormat === "MULTI_CHOICE";
  const isTheCall = market.marketFormat === "THE_CALL";

  // Core fields
  const [title, setTitle] = useState(market.title);
  const [question, setQuestion] = useState(market.question);
  const [subcategory, setSubcategory] = useState(market.subcategory);
  const [imageUrl, setImageUrl] = useState(market.imageUrl ?? "");
  const [geo, setGeo] = useState(market.geo ?? "");
  const [closesAt, setClosesAt] = useState(
    market.closesAt ? new Date(market.closesAt).toISOString().slice(0, 10) : ""
  );
  const [resolutionSource, setResolutionSource] = useState(market.resolutionSource ?? "");
  const [sourcePrimary, setSourcePrimary] = useState(market.sourcePrimary ?? "");
  const [sourceBackup, setSourceBackup] = useState(market.sourceBackup ?? "");
  const [baselineSnapshot, setBaselineSnapshot] = useState(market.baselineSnapshot ?? "");
  const [formula, setFormula] = useState(market.formula ?? "");
  const [voidRule, setVoidRule] = useState(market.voidRule ?? "");

  // MULTI_CHOICE contender state — pre-populated from description
  const initialContenders: Contender[] = isMultiChoice
    ? (() => {
        const parsed = parseContenders(market.description);
        return parsed.length >= 2 ? parsed.map(c => ({ key: c.key, name: c.name, venue: c.venue ?? "" })) :
          [{ key: "A", name: "", venue: "" }, { key: "B", name: "", venue: "" }, { key: "C", name: "", venue: "" }];
      })()
    : [];

  const [editContenders, setEditContenders] = useState<Contender[]>(initialContenders);

  // THE_CALL option state — pre-populated from description
  type CallOption = { key: string; label: string };
  const initialOptions: CallOption[] = isTheCall
    ? (() => {
        try {
          const p = JSON.parse(market.description ?? "{}");
          if (Array.isArray(p.options)) return p.options as CallOption[];
        } catch {}
        return [{ key: "A", label: "" }, { key: "B", label: "" }];
      })()
    : [];

  const [editOptions, setEditOptions] = useState<CallOption[]>(initialOptions);

  // Preserved extra fields from the existing description (metric/period/recurring for MULTI_CHOICE; context for THE_CALL)
  const existingDescriptionExtras = useMemo(() => {
    try {
      return JSON.parse(market.description ?? "{}") as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  }, [market.description]);

  // Live preview of the exact JSON that will be sent on Save
  const editPreviewJson = useMemo(() => {
    if (isMultiChoice) {
      const valid = editContenders.filter(c => c.name.trim());
      if (valid.length === 0) return null;
      const { contenders: _c, ...rest } = existingDescriptionExtras as any;
      return JSON.stringify(
        {
          ...rest,
          contenders: valid.map(c => ({
            key: c.key,
            name: c.name.trim(),
            ...(c.venue?.trim() ? { venue: c.venue.trim() } : {}),
          })),
        },
        null,
        2,
      );
    }
    if (isTheCall) {
      const valid = editOptions.filter(o => o.label.trim());
      if (valid.length === 0) return null;
      const { options: _o, ...rest } = existingDescriptionExtras as any;
      return JSON.stringify({ ...rest, options: valid }, null, 2);
    }
    return null;
  }, [isMultiChoice, isTheCall, editContenders, editOptions, existingDescriptionExtras]);

  const addEditContender = () => {
    if (editContenders.length >= 5) return;
    const usedKeys = new Set(editContenders.map(c => c.key));
    const nextKey = CONTENDER_KEYS.find(k => !usedKeys.has(k)) ?? CONTENDER_KEYS[editContenders.length];
    setEditContenders([...editContenders, { key: nextKey, name: "", venue: "" }]);
  };
  const removeEditContender = (i: number) => {
    if (editContenders.length <= 2) return;
    // Preserve stable keys — do NOT reindex remaining contenders; votes are
    // stored by key so any remapping would silently corrupt existing predictions.
    setEditContenders(editContenders.filter((_, idx) => idx !== i));
  };
  const updateEditContender = (i: number, field: "name" | "venue", value: string) => {
    setEditContenders(editContenders.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const addEditOption = () => {
    if (editOptions.length >= 5) return;
    const usedKeys = new Set(editOptions.map(o => o.key));
    const nextKey = CONTENDER_KEYS.find(k => !usedKeys.has(k)) ?? CONTENDER_KEYS[editOptions.length];
    setEditOptions([...editOptions, { key: nextKey, label: "" }]);
  };
  const removeEditOption = (i: number) => {
    if (editOptions.length <= 2) return;
    // Preserve stable keys — do NOT reindex remaining options.
    setEditOptions(editOptions.filter((_, idx) => idx !== i));
  };
  const updateEditOption = (i: number, value: string) => {
    setEditOptions(editOptions.map((o, idx) => idx === i ? { ...o, label: value } : o));
  };

  const handleSave = () => {
    if (!title.trim() || title.trim().length < 5) {
      toast({ title: "Title must be at least 5 characters", variant: "destructive" });
      return;
    }
    if (!question.trim() || question.trim().length < 10) {
      toast({ title: "Question must be at least 10 characters", variant: "destructive" });
      return;
    }

    // Build description JSON for structured formats
    let description: string | undefined;
    if (isMultiChoice) {
      const valid = editContenders.filter(c => c.name.trim());
      if (valid.length < 2) {
        toast({ title: "Add at least 2 contenders", variant: "destructive" });
        return;
      }
      // Preserve other description fields (metric, period, recurring) from original
      let existing: Record<string, unknown> = {};
      try { existing = JSON.parse(market.description ?? "{}"); } catch {}
      description = JSON.stringify({
        ...existing,
        contenders: valid.map(c => ({
          key: c.key,
          name: c.name.trim(),
          ...(c.venue?.trim() ? { venue: c.venue.trim() } : {}),
        })),
      });
    } else if (isTheCall) {
      const valid = editOptions.filter(o => o.label.trim());
      if (valid.length < 2) {
        toast({ title: "Add at least 2 options", variant: "destructive" });
        return;
      }
      let existing: Record<string, unknown> = {};
      try { existing = JSON.parse(market.description ?? "{}"); } catch {}
      description = JSON.stringify({ ...existing, options: valid });
    }

    setIsSaving(true);
    patchMarket.mutate({
      id: market.id,
      data: {
        title: title.trim(),
        question: question.trim(),
        subcategory: subcategory.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        geo: geo.trim() || undefined,
        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
        resolutionSource: resolutionSource.trim() || undefined,
        sourcePrimary: sourcePrimary.trim() || undefined,
        sourceBackup: sourceBackup.trim() || undefined,
        baselineSnapshot: baselineSnapshot.trim() || undefined,
        formula: formula.trim() || undefined,
        voidRule: voidRule.trim() || undefined,
        ...(description !== undefined ? { description } : {}),
      },
    }, {
      onSuccess: () => {
        toast({ title: "Market updated ✓" });
        queryClient.invalidateQueries({ queryKey: getAdminListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTrendingMarketsQueryKey() });
        setIsSaving(false);
        onSuccess();
      },
      onError: () => {
        toast({ title: "Failed to save changes", variant: "destructive" });
        setIsSaving(false);
      },
    });
  };

  return (
    <div className="border-t border-border pt-4 mt-2 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-primary uppercase tracking-wider">✏️ Edit Market</p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
      </div>

      <div className="space-y-3">
        {/* Read-only format indicator — marketFormat is immutable after creation */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Format</span>
          <Badge variant="secondary" className="text-[10px] py-0">{ENGINE_LABELS[market.marketFormat ?? ""] ?? market.marketFormat}</Badge>
          <span className="text-[10px] text-muted-foreground/60 italic ml-auto">immutable</span>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Question</Label>
          <Textarea value={question} onChange={e => setQuestion(e.target.value)} className="text-sm min-h-[60px]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Subcategory</Label>
            <Input value={subcategory} onChange={e => setSubcategory(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Close Date</Label>
            <Input type="date" value={closesAt} onChange={e => setClosesAt(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Image URL</Label>
          <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Geography</Label>
          <Input value={geo} onChange={e => setGeo(e.target.value)} placeholder="e.g. Boston · South End" className="h-8 text-sm" />
        </div>

        {/* MULTI_CHOICE contender builder */}
        {isMultiChoice && (
          <div className="space-y-2 bg-primary/5 rounded-lg p-3 border border-primary/20">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-primary font-bold">⚡ Contenders</Label>
              {editContenders.length < 5 && (
                <Button type="button" variant="ghost" size="sm" onClick={addEditContender} className="h-6 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              )}
            </div>
            {editContenders.map((c, i) => (
              <div key={c.key} className="flex gap-2 items-start">
                <span className="text-xs font-bold text-primary w-5 pt-2 shrink-0">{c.key}</span>
                <div className="flex-1 space-y-1">
                  <Input value={c.name} onChange={e => updateEditContender(i, "name", e.target.value)} placeholder="Contender name" className="h-7 text-xs" />
                  <Input value={c.venue} onChange={e => updateEditContender(i, "venue", e.target.value)} placeholder="Venue / handle (optional)" className="h-6 text-[11px] text-muted-foreground" />
                </div>
                {editContenders.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEditContender(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* THE_CALL option builder */}
        {isTheCall && (
          <div className="space-y-2 bg-cyan-50 rounded-lg p-3 border border-cyan-200">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-cyan-700 font-bold">🎯 Options</Label>
              {editOptions.length < 5 && (
                <Button type="button" variant="ghost" size="sm" onClick={addEditOption} className="h-6 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              )}
            </div>
            {editOptions.map((o, i) => (
              <div key={o.key} className="flex gap-2 items-center">
                <span className="text-xs font-bold text-cyan-700 w-5 shrink-0">{o.key}</span>
                <Input value={o.label} onChange={e => updateEditOption(i, e.target.value)} placeholder="Option label" className="h-7 text-xs" />
                {editOptions.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEditOption(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live JSON preview — only for structured formats */}
        {editPreviewJson && <PreviewJsonPanel json={editPreviewJson} />}

        {/* Resolution metadata (collapsed section) */}
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            Resolution rules
          </summary>
          <div className="mt-2 space-y-2">
            <Input value={resolutionSource} onChange={e => setResolutionSource(e.target.value)} placeholder="Resolution source" className="h-8 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={sourcePrimary} onChange={e => setSourcePrimary(e.target.value)} placeholder="Primary source" className="h-8 text-xs" />
              <Input value={sourceBackup} onChange={e => setSourceBackup(e.target.value)} placeholder="Backup source" className="h-8 text-xs" />
            </div>
            <Input value={baselineSnapshot} onChange={e => setBaselineSnapshot(e.target.value)} placeholder="Baseline snapshot" className="h-8 text-xs" />
            <Input value={formula} onChange={e => setFormula(e.target.value)} placeholder="Formula / scoring rule" className="h-8 text-xs" />
            <Input value={voidRule} onChange={e => setVoidRule(e.target.value)} placeholder="Void criteria" className="h-8 text-xs" />
          </div>
        </details>
      </div>

      <Button size="sm" className="w-full" onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}

// ── Template Picker Sub-flow ─────────────────────────────────────────────────

interface TemplateMarketFormProps {
  templateId: number;
  franchiseName: string;
  engine: string;
  templateQuestion: string;
  clockType: string;
  category: string;
  defaultDurationDays: number;
  onBack: () => void;
  onSuccess: () => void;
}

function TemplateMarketForm({
  templateId, franchiseName, engine, templateQuestion, clockType, category,
  defaultDurationDays, onBack, onSuccess,
}: TemplateMarketFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createFromTemplate = useCreateMarketFromTemplate();

  // Placeholder slot values
  const placeholders = extractPlaceholders(templateQuestion);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>(
    () => Object.fromEntries(placeholders.map(p => [p, ""]))
  );

  // Contenders for MULTI_CHOICE / THE_CALL engines
  const [contenders, setContenders] = useState<Contender[]>([
    { key: "A", name: "", venue: "" },
    { key: "B", name: "", venue: "" },
    { key: "C", name: "", venue: "" },
  ]);
  const [metric, setMetric] = useState("");
  const [period, setPeriod] = useState("");
  const [recurring, setRecurring] = useState(false);

  const form = useForm<z.infer<typeof templateMarketSchema>>({
    resolver: zodResolver(templateMarketSchema),
    defaultValues: {},
  });

  const filledQuestion = fillPlaceholders(templateQuestion, placeholderValues);
  const allSlotsFilled = placeholders.every(p => (placeholderValues[p] ?? "").trim().length > 0);

  const addContender = () => {
    if (contenders.length >= 5) return;
    const key = CONTENDER_KEYS[contenders.length];
    setContenders([...contenders, { key, name: "", venue: "" }]);
  };

  const removeContender = (i: number) => {
    if (contenders.length <= 2) return;
    setContenders(contenders.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, key: CONTENDER_KEYS[idx] })));
  };

  const updateContender = (i: number, field: "name" | "venue", value: string) => {
    setContenders(contenders.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const onSubmit = (data: z.infer<typeof templateMarketSchema>) => {
    if (!allSlotsFilled) {
      toast({ title: "Fill in all placeholder slots before publishing", variant: "destructive" });
      return;
    }

    // Build description JSON for MULTI_CHOICE / THE_CALL
    let description: string | undefined;
    if (engine === "MULTI_CHOICE") {
      const validContenders = contenders.filter(c => c.name.trim());
      if (validContenders.length < 2) {
        toast({ title: "Add at least 2 contenders", variant: "destructive" });
        return;
      }
      description = JSON.stringify({
        contenders: validContenders.map(c => ({
          key: c.key,
          name: c.name.trim(),
          ...(c.venue.trim() ? { venue: c.venue.trim() } : {}),
        })),
        ...(metric ? { metric } : {}),
        ...(period ? { period } : {}),
        ...(recurring ? { recurring: true } : {}),
      });
    }

    if (engine === "THE_CALL") {
      const validOptions = contenders.filter(c => c.name.trim());
      if (validOptions.length < 2) {
        toast({ title: "Add at least 2 options", variant: "destructive" });
        return;
      }
      description = JSON.stringify({
        options: validOptions.map(c => ({
          key: c.key,
          label: c.name.trim(),
        })),
        ...(metric ? { context: metric } : {}),
      });
    }

    setIsSubmitting(true);
    createFromTemplate.mutate({
      id: templateId,
      data: {
        title: data.title,
        filledQuestion,
        subcategory: data.subcategory,
        description,
        imageUrl: data.imageUrl || undefined,
        closesAt: data.closesAt ? new Date(data.closesAt).toISOString() : undefined,
        geo: data.geo || undefined,
        clockType: clockType as any,
      },
    }, {
      onSuccess: () => {
        toast({ title: `Market launched from ${franchiseName}! ⚡` });
        queryClient.invalidateQueries({ queryKey: getAdminListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTrendingMarketsQueryKey() });
        setIsSubmitting(false);
        onSuccess();
      },
      onError: () => {
        toast({ title: "Failed to launch market", variant: "destructive" });
        setIsSubmitting(false);
      },
    });
  };

  return (
    <Card className="border-primary/30 shadow-md">
      <CardHeader className="pb-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors w-fit">
          <ChevronLeft className="w-4 h-4" /> Back to templates
        </button>
        <CardTitle className="font-editorial text-xl flex items-center gap-2">
          <span className="text-primary text-lg">⚡</span>
          {franchiseName}
        </CardTitle>
        <div className="flex gap-2 flex-wrap mt-1">
          <Badge variant="secondary" className="text-xs">{ENGINE_LABELS[engine] ?? engine}</Badge>
          <Badge variant="outline" className="text-xs">{getCategoryLabel(category)}</Badge>
          <Badge variant="outline" className="text-xs">{CLOCK_TYPE_LABELS[clockType]?.label ?? clockType}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* Placeholder slot filling */}
          {placeholders.length > 0 && (
            <div className="space-y-3 bg-primary/5 rounded-xl p-4 border border-primary/20">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Fill in the subjects</p>
              {placeholders.map(placeholder => (
                <div key={placeholder} className="space-y-1">
                  <Label className="text-xs font-mono text-primary">{placeholder}</Label>
                  <Input
                    value={placeholderValues[placeholder] ?? ""}
                    onChange={e => setPlaceholderValues(v => ({ ...v, [placeholder]: e.target.value }))}
                    placeholder={`Enter ${placeholder.replace(/[\[\]]/g, "")}`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Live preview of the filled question */}
          <div className="bg-muted/50 rounded-lg p-3 border border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Preview</p>
            <p className="text-sm font-medium leading-snug text-foreground">
              {filledQuestion}
            </p>
            {!allSlotsFilled && placeholders.length > 0 && (
              <p className="text-[10px] text-amber-600 mt-1">Fill all slots above to complete the question</p>
            )}
          </div>

          {/* Contender / option builder for MULTI_CHOICE */}
          {engine === "MULTI_CHOICE" && (
            <div className="space-y-3 bg-primary/5 rounded-xl p-4 border border-primary/20">
              <div className="flex items-center justify-between">
                <Label className="text-primary font-bold">⚡ Contenders</Label>
                {contenders.length < 5 && (
                  <Button type="button" variant="ghost" size="sm" onClick={addContender} className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                )}
              </div>
              {contenders.map((c, i) => (
                <div key={c.key} className="flex gap-2 items-start">
                  <span className="text-xs font-bold text-primary w-5 pt-2 shrink-0">{c.key}</span>
                  <div className="flex-1 space-y-1">
                    <Input
                      value={c.name}
                      onChange={e => updateContender(i, "name", e.target.value)}
                      placeholder="Contender name"
                      className="h-8 text-sm"
                    />
                    <Input
                      value={c.venue}
                      onChange={e => updateContender(i, "venue", e.target.value)}
                      placeholder="Venue / handle (optional)"
                      className="h-7 text-xs text-muted-foreground"
                    />
                  </div>
                  {contenders.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeContender(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-xs">Metric</Label>
                  <Input value={metric} onChange={e => setMetric(e.target.value)} placeholder="e.g. Google review count" className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Period</Label>
                  <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. September 2026" className="h-8 text-xs mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={e => setRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-primary/40 accent-primary"
                />
                <span className="text-xs font-medium">🔁 Recurring — auto-spawn next edition monthly</span>
              </label>
            </div>
          )}

          {/* Option builder for THE_CALL */}
          {engine === "THE_CALL" && (
            <div className="space-y-3 bg-primary/5 rounded-xl p-4 border border-primary/20">
              <div className="flex items-center justify-between">
                <Label className="text-primary font-bold">🎯 Answer Options</Label>
                {contenders.length < 6 && (
                  <Button type="button" variant="ghost" size="sm" onClick={addContender} className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                )}
              </div>
              {contenders.map((c, i) => (
                <div key={c.key} className="flex gap-2 items-center">
                  <span className="text-xs font-bold text-primary w-5 shrink-0">{c.key}</span>
                  <Input
                    value={c.name}
                    onChange={e => updateContender(i, "name", e.target.value)}
                    placeholder="Option label"
                    className="h-8 text-sm"
                  />
                  {contenders.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeContender(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div>
                <Label className="text-xs">Context (optional)</Label>
                <Input value={metric} onChange={e => setMetric(e.target.value)} placeholder="e.g. Best for weekly grocery run" className="h-8 text-xs mt-1" />
              </div>
            </div>
          )}

          {/* Live JSON preview for structured formats */}
          {(engine === "MULTI_CHOICE" || engine === "THE_CALL") && (() => {
            const preview = buildDescriptionPreview(engine, contenders, metric, period, recurring);
            return preview
              ? <PreviewJsonPanel json={preview} />
              : (
                <p className="text-[11px] text-muted-foreground italic p-3 bg-muted/40 rounded-lg border border-border">
                  Fill in at least one contender to see the preview.
                </p>
              );
          })()}

          <div className="space-y-2">
            <Label>Short Title</Label>
            <Input {...form.register("title")} placeholder="Market title" />
            {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Subcategory</Label>
            <Input {...form.register("subcategory")} placeholder="e.g. Nightlife" />
            {form.formState.errors.subcategory && <p className="text-xs text-destructive">{form.formState.errors.subcategory.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Close Date (optional)</Label>
              <Input type="date" {...form.register("closesAt")} />
              <p className="text-[10px] text-muted-foreground">Default: +{defaultDurationDays} days</p>
            </div>
            <div className="space-y-2">
              <Label>Geography (optional)</Label>
              <Input {...form.register("geo")} placeholder="e.g. Boston · South End" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Image URL (optional)</Label>
            <Input {...form.register("imageUrl")} placeholder="https://..." />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || !allSlotsFilled}>
            {isSubmitting ? "Launching..." : `Launch ${franchiseName} ⚡`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Template Grid ────────────────────────────────────────────────────────────

type Template = {
  id: number;
  franchiseName: string;
  engine: string;
  templateQuestion: string;
  clockType: string;
  category: string;
  defaultDurationDays: number;
  description?: string | null;
};

interface TemplateSectionProps {
  onSelectTemplate: (t: Template) => void;
}

const templateEditSchema = z.object({
  franchiseName: z.string().min(2),
  engine: z.enum(ALL_FORMATS),
  templateQuestion: z.string().min(10),
  clockType: z.enum(ALL_CLOCK_TYPES),
  category: z.enum(ALL_CATEGORIES),
  defaultDurationDays: z.coerce.number().int().positive(),
  description: z.string().optional(),
});
type TemplateEditForm = z.infer<typeof templateEditSchema>;

function TemplateSection({ onSelectTemplate }: TemplateSectionProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListMarketTemplates({
    query: { queryKey: getListMarketTemplatesQueryKey() },
  });

  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateMutation = useUpdateMarketTemplate();
  const deleteMutation = useDeleteMarketTemplate();

  const editForm = useForm<TemplateEditForm>({
    resolver: zodResolver(templateEditSchema),
  });

  function openEdit(t: Template, e: React.MouseEvent) {
    e.stopPropagation();
    setEditTarget(t);
    editForm.reset({
      franchiseName: t.franchiseName,
      engine: t.engine as TemplateEditForm["engine"],
      templateQuestion: t.templateQuestion,
      clockType: t.clockType as TemplateEditForm["clockType"],
      category: t.category as TemplateEditForm["category"],
      defaultDurationDays: t.defaultDurationDays,
      description: t.description ?? "",
    });
  }

  async function handleEditSave(values: TemplateEditForm) {
    if (!editTarget) return;
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({ id: editTarget.id, data: values });
      await queryClient.invalidateQueries({ queryKey: getListMarketTemplatesQueryKey() });
      toast({ title: "Template updated" });
      setEditTarget(null);
    } catch {
      toast({ title: "Failed to update template", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
      await queryClient.invalidateQueries({ queryKey: getListMarketTemplatesQueryKey() });
      toast({ title: "Template deleted" });
      setDeleteTarget(null);
    } catch {
      toast({ title: "Failed to delete template", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  const templates: Template[] = (data?.templates ?? []) as Template[];

  if (templates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No templates found. Add some via the API.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {templates.map(t => (
          <button
            key={t.id}
            className="w-full text-left group"
            onClick={() => onSelectTemplate(t)}
          >
            <Card className="border-border hover:border-primary/50 transition-colors hover:shadow-md cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-editorial font-bold text-sm group-hover:text-primary transition-colors">{t.franchiseName}</span>
                      <Badge variant="secondary" className="text-[10px] py-0">{ENGINE_LABELS[t.engine] ?? t.engine}</Badge>
                      <Badge variant="outline" className="text-[10px] py-0">{getCategoryLabel(t.category)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 font-mono leading-relaxed">
                      {t.templateQuestion}
                    </p>
                    {t.description && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-1">{t.description}</p>
                    )}
                  </div>
                  {/* Edit / Delete action buttons */}
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      title="Edit template"
                      onClick={e => openEdit(t, e)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete template"
                      onClick={e => { e.stopPropagation(); setDeleteTarget(t); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>{CLOCK_TYPE_LABELS[t.clockType]?.label ?? t.clockType}</span>
                  <span>·</span>
                  <span>Default {t.defaultDurationDays}d window</span>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(handleEditSave)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Franchise name</Label>
              <Input {...editForm.register("franchiseName")} placeholder="e.g. Trend Watch" />
              {editForm.formState.errors.franchiseName && (
                <p className="text-xs text-destructive">{editForm.formState.errors.franchiseName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Engine (format)</Label>
              <Select
                value={editForm.watch("engine")}
                onValueChange={v => editForm.setValue("engine", v as TemplateEditForm["engine"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_FORMATS.map(f => (
                    <SelectItem key={f} value={f}>{ENGINE_LABELS[f] ?? f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template question</Label>
              <Textarea {...editForm.register("templateQuestion")} rows={3} placeholder="Will {{subject}} be..." />
              {editForm.formState.errors.templateQuestion && (
                <p className="text-xs text-destructive">{editForm.formState.errors.templateQuestion.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={editForm.watch("category")}
                  onValueChange={v => editForm.setValue("category", v as TemplateEditForm["category"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Clock type</Label>
                <Select
                  value={editForm.watch("clockType")}
                  onValueChange={v => editForm.setValue("clockType", v as TemplateEditForm["clockType"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_CLOCK_TYPES.map(c => (
                      <SelectItem key={c} value={c}>{CLOCK_TYPE_LABELS[c]?.label ?? c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Default duration (days)</Label>
              <Input
                type="number"
                min={1}
                {...editForm.register("defaultDurationDays")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea {...editForm.register("description")} rows={2} placeholder="Short summary for admins" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.franchiseName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the franchise template. Markets already created from it are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Main Admin Page ──────────────────────────────────────────────────────────

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("STANDARD");
  const [selectedClockType, setSelectedClockType] = useState<string>("EVERGREEN");
  const [contenders, setContenders] = useState<Contender[]>([
    { key: "A", name: "", venue: "" },
    { key: "B", name: "", venue: "" },
    { key: "C", name: "", venue: "" },
  ]);
  const [metric, setMetric] = useState("");
  const [period, setPeriod] = useState("");
  const [recurring, setRecurring] = useState(false);

  // "from-template" | "custom" creation mode
  const [createMode, setCreateMode] = useState<"template" | "custom">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const [marketSearch, setMarketSearch] = useState("");

  const { data: markets, isLoading } = useAdminListMarkets({
    query: { queryKey: getAdminListMarketsQueryKey() }
  });

  const createMarket = useCreateMarket();
  const resolveMarket = useResolveMarket();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { category: "CULTURE", marketFormat: "STANDARD" }
  });

  const addContender = () => {
    if (contenders.length >= 5) return;
    const key = CONTENDER_KEYS[contenders.length];
    setContenders([...contenders, { key, name: "", venue: "" }]);
  };

  const removeContender = (i: number) => {
    if (contenders.length <= 2) return;
    setContenders(contenders.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, key: CONTENDER_KEYS[idx] })));
  };

  const updateContender = (i: number, field: "name" | "venue", value: string) => {
    setContenders(contenders.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    let description = data.description || undefined;
    const clockType = selectedClockType as any;

    if (selectedFormat === "MULTI_CHOICE") {
      const validContenders = contenders.filter(c => c.name.trim());
      if (validContenders.length < 2) {
        toast({ title: "Add at least 2 contenders", variant: "destructive" });
        return;
      }
      description = JSON.stringify({
        contenders: validContenders.map(c => ({
          key: c.key,
          name: c.name.trim(),
          ...(c.venue.trim() ? { venue: c.venue.trim() } : {}),
        })),
        ...(metric ? { metric } : {}),
        ...(period ? { period } : {}),
        ...(recurring ? { recurring: true } : {}),
      });
    }

    if (selectedFormat === "THE_CALL") {
      const validOptions = contenders.filter(c => c.name.trim());
      if (validOptions.length < 2) {
        toast({ title: "Add at least 2 options", variant: "destructive" });
        return;
      }
      description = JSON.stringify({
        options: validOptions.map(c => ({
          key: c.key,
          label: c.name.trim(),
        })),
        ...(metric ? { context: metric } : {}),
      });
    }

    setIsCreating(true);
    createMarket.mutate({
      data: {
        ...data,
        marketFormat: selectedFormat as any,
        description,
        imageUrl: data.imageUrl || undefined,
        sourcePrimary: data.sourcePrimary || undefined,
        sourceBackup: data.sourceBackup || undefined,
        baselineSnapshot: data.baselineSnapshot || undefined,
        formula: data.formula || undefined,
        voidRule: data.voidRule || undefined,
        geo: data.geo || undefined,
        closesAt: data.closesAt ? new Date(data.closesAt).toISOString() : undefined,
        clockType,
        publishAt: data.publishAt ? new Date(data.publishAt).toISOString() : undefined,
        peakUntil: data.peakUntil ? new Date(data.peakUntil).toISOString() : undefined,
        expireAt: data.expireAt ? new Date(data.expireAt).toISOString() : undefined,
        refreshRule: data.refreshRule || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Market launched!" });
        form.reset();
        setContenders([
          { key: "A", name: "", venue: "" },
          { key: "B", name: "", venue: "" },
          { key: "C", name: "", venue: "" },
        ]);
        setMetric(""); setPeriod(""); setRecurring(false);
        queryClient.invalidateQueries({ queryKey: getAdminListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTrendingMarketsQueryKey() });
        setIsCreating(false);
      },
      onError: () => {
        toast({ title: "Failed to launch market", variant: "destructive" });
        setIsCreating(false);
      }
    });
  };

  const handleResolve = (id: number, outcome: string) => {
    if (!confirm(`Resolve this market as "${outcome}"? This cannot be undone.`)) return;
    setResolvingId(id);
    resolveMarket.mutate({ id, data: { outcome } }, {
      onSuccess: () => {
        toast({ title: `Called it: ${outcome}` });
        queryClient.invalidateQueries({ queryKey: getAdminListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        setResolvingId(null);
      },
      onError: () => {
        toast({ title: "Failed to resolve market", variant: "destructive" });
        setResolvingId(null);
      }
    });
  };

  const allOpenMarkets = markets?.markets?.filter(m => m.status === 'OPEN') ?? [];
  const openMarkets = marketSearch.trim()
    ? allOpenMarkets.filter(m =>
        m.title.toLowerCase().includes(marketSearch.toLowerCase()) ||
        m.question.toLowerCase().includes(marketSearch.toLowerCase()) ||
        m.subcategory?.toLowerCase().includes(marketSearch.toLowerCase()) ||
        m.category?.toLowerCase().includes(marketSearch.toLowerCase())
      )
    : allOpenMarkets;
  const recentlyResolved = (markets?.markets ?? [])
    .filter(m => m.status === 'RESOLVED' || m.status === 'CLOSED')
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-muted/20 pb-24">
      <div className="bg-foreground text-background py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-editorial font-bold">BuzzOrBoo Admin</h1>
                <p className="text-background/70 text-sm">Launch markets and declare outcomes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xs text-background/60 hover:text-background transition-colors">← Public feed</Link>
              <Link href="/markets" className="text-xs text-background/60 hover:text-background transition-colors">Markets</Link>
              <Link href="/leaderboard" className="text-xs text-background/60 hover:text-background transition-colors">BuzzRank</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats bar */}
      {markets && (
        <div className="container mx-auto px-4 pt-6 pb-0">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            {[
              { label: "Open Markets", value: allOpenMarkets.length },
              { label: "Total Markets", value: markets.markets?.length ?? 0 },
              { label: "Resolved", value: (markets?.markets ?? []).filter(m => m.status === 'RESOLVED' || m.status === 'CLOSED').length },
              { label: "Total Predictions", value: (markets?.markets ?? []).reduce((s, m) => s + (m.totalPredictions ?? 0), 0).toLocaleString() },
              { label: "Buzz Battle", value: (markets?.markets ?? []).filter(m => m.marketFormat === 'MULTI_CHOICE').length },
              { label: "Hot or Not", value: (markets?.markets ?? []).filter(m => m.marketFormat === 'HOT_OR_NOT').length },
            ].map(({ label, value }) => (
              <div key={label} className="bg-background/10 border border-background/20 rounded-xl px-4 py-3">
                <div className="text-2xl font-editorial font-bold text-background">{value}</div>
                <div className="text-[11px] text-background/60 font-medium uppercase tracking-wider mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Create market (template or custom) */}
        <div className="lg:col-span-1">

          {/* Mode toggle */}
          {!selectedTemplate && (
            <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4">
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${createMode === "template" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setCreateMode("template")}
              >
                <Layers className="w-3.5 h-3.5" />
                From Template
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${createMode === "custom" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setCreateMode("custom")}
              >
                <Pencil className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>
          )}

          {/* Template flow */}
          {createMode === "template" && !selectedTemplate && (
            <Card className="sticky top-24 border-primary/20 shadow-md">
              <CardHeader>
                <CardTitle className="font-editorial text-xl flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Franchise Templates
                </CardTitle>
                <p className="text-xs text-muted-foreground">Bible §42 — Pick a mold, fill in the subjects, publish.</p>
              </CardHeader>
              <CardContent className="max-h-[70vh] overflow-y-auto">
                <TemplateSection onSelectTemplate={t => setSelectedTemplate(t)} />
              </CardContent>
            </Card>
          )}

          {createMode === "template" && selectedTemplate && (
            <div className="sticky top-24">
              <TemplateMarketForm
                templateId={selectedTemplate.id}
                franchiseName={selectedTemplate.franchiseName}
                engine={selectedTemplate.engine}
                templateQuestion={selectedTemplate.templateQuestion}
                clockType={selectedTemplate.clockType}
                category={selectedTemplate.category}
                defaultDurationDays={selectedTemplate.defaultDurationDays}
                onBack={() => setSelectedTemplate(null)}
                onSuccess={() => setSelectedTemplate(null)}
              />
            </div>
          )}

          {/* Custom market form */}
          {createMode === "custom" && (
            <Card className="sticky top-24 border-primary/20 shadow-md">
              <CardHeader>
                <CardTitle className="font-editorial text-2xl">Launch a Market</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>The Big Question</Label>
                    <Textarea {...form.register("question")} placeholder="Will X happen by Y?" />
                  </div>

                  <div className="space-y-2">
                    <Label>Short Title</Label>
                    <Input {...form.register("title")} placeholder="Market title" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        onValueChange={(val) => form.setValue("category", val as any)}
                        defaultValue={form.getValues("category")}
                      >
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {ALL_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Subcategory</Label>
                      <Input {...form.register("subcategory")} placeholder="e.g. Nightlife" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Market Format</Label>
                    <Select
                      onValueChange={(val) => { setSelectedFormat(val); form.setValue("marketFormat", val as any); }}
                      defaultValue="STANDARD"
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD">Standard (YES / NO)</SelectItem>
                        <SelectItem value="HOT_OR_NOT">Hot or Not (vibe check)</SelectItem>
                        <SelectItem value="HEAD_TO_HEAD">Head to Head (A vs B)</SelectItem>
                        <SelectItem value="MULTI_CHOICE">👑 Buzz Battle (3–5 contenders)</SelectItem>
                        <SelectItem value="BUZZ_OR_BOO">⚡ Buzz or Boo (one-tap verdict)</SelectItem>
                        <SelectItem value="THE_CALL">🎯 The Call (crowd intelligence)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* THE_CALL option builder */}
                  {selectedFormat === "THE_CALL" && (
                    <div className="space-y-3 bg-primary/5 rounded-xl p-4 border border-primary/20">
                      <div className="flex items-center justify-between">
                        <Label className="text-primary font-bold">🎯 Answer Options</Label>
                        {contenders.length < 6 && (
                          <Button type="button" variant="ghost" size="sm" onClick={addContender} className="h-7 text-xs gap-1">
                            <Plus className="w-3 h-3" /> Add
                          </Button>
                        )}
                      </div>
                      {contenders.map((c, i) => (
                        <div key={c.key} className="flex gap-2 items-center">
                          <span className="text-xs font-bold text-primary w-5 shrink-0">{c.key}</span>
                          <Input
                            value={c.name}
                            onChange={e => updateContender(i, "name", e.target.value)}
                            placeholder="Option label (e.g. Whole Foods)"
                            className="h-8 text-sm"
                          />
                          {contenders.length > 2 && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeContender(i)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <div>
                        <Label className="text-xs">Context (optional)</Label>
                        <Input value={metric} onChange={e => setMetric(e.target.value)} placeholder="e.g. Best for weekly grocery run" className="h-8 text-xs mt-1" />
                      </div>
                    </div>
                  )}

                  {/* MULTI_CHOICE contender builder */}
                  {selectedFormat === "MULTI_CHOICE" && (
                    <div className="space-y-3 bg-primary/5 rounded-xl p-4 border border-primary/20">
                      <div className="flex items-center justify-between">
                        <Label className="text-primary font-bold">⚡ Contenders</Label>
                        {contenders.length < 5 && (
                          <Button type="button" variant="ghost" size="sm" onClick={addContender} className="h-7 text-xs gap-1">
                            <Plus className="w-3 h-3" /> Add
                          </Button>
                        )}
                      </div>
                      {contenders.map((c, i) => (
                        <div key={c.key} className="flex gap-2 items-start">
                          <span className="text-xs font-bold text-primary w-5 pt-2 shrink-0">{c.key}</span>
                          <div className="flex-1 space-y-1">
                            <Input
                              value={c.name}
                              onChange={e => updateContender(i, "name", e.target.value)}
                              placeholder="Contender name"
                              className="h-8 text-sm"
                            />
                            <Input
                              value={c.venue}
                              onChange={e => updateContender(i, "venue", e.target.value)}
                              placeholder="Venue / handle (optional)"
                              className="h-7 text-xs text-muted-foreground"
                            />
                          </div>
                          {contenders.length > 2 && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeContender(i)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <Label className="text-xs">Metric</Label>
                          <Input value={metric} onChange={e => setMetric(e.target.value)} placeholder="e.g. Google review count" className="h-8 text-xs mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs">Period</Label>
                          <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. September 2026" className="h-8 text-xs mt-1" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                        <input
                          type="checkbox"
                          checked={recurring}
                          onChange={e => setRecurring(e.target.checked)}
                          className="h-4 w-4 rounded border-primary/40 accent-primary"
                        />
                        <span className="text-xs font-medium">🔁 Recurring — auto-spawn next edition monthly</span>
                      </label>
                    </div>
                  )}

                  {/* Live JSON preview for structured formats */}
                  {(selectedFormat === "MULTI_CHOICE" || selectedFormat === "THE_CALL") && (() => {
                    const preview = buildDescriptionPreview(selectedFormat, contenders, metric, period, recurring);
                    return (
                      <details className="group">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none list-none flex items-center gap-1 py-1">
                          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                          Preview JSON
                        </summary>
                        <div className="mt-2">
                          {preview ? (
                            <pre className="text-[11px] bg-muted/60 border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-foreground/80 font-mono leading-relaxed">
                              {preview}
                            </pre>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic p-3 bg-muted/40 rounded-lg border border-border">
                              Fill in at least one contender to see the preview.
                            </p>
                          )}
                        </div>
                      </details>
                    );
                  })()}

                  {selectedFormat !== "MULTI_CHOICE" && selectedFormat !== "THE_CALL" && (
                    <div className="space-y-2">
                      <Label>Description (optional)</Label>
                      <Textarea {...form.register("description")} placeholder="Additional context..." />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Image URL (optional)</Label>
                    <Input {...form.register("imageUrl")} placeholder="https://..." />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Resolution Source</Label>
                      <Input {...form.register("resolutionSource")} placeholder="e.g. Google Maps" />
                    </div>
                    <div className="space-y-2">
                      <Label>Close Date</Label>
                      <Input type="date" {...form.register("closesAt")} />
                    </div>
                  </div>

                  {/* Clock Lifecycle Section */}
                  <div className="space-y-3 bg-primary/5 rounded-xl p-4 border border-primary/10">
                    <p className="text-xs font-bold text-primary/80 uppercase tracking-wider">⏱ Clock Lifecycle (Market Bible §40)</p>

                    <div className="space-y-2">
                      <Label className="text-xs">Clock Type</Label>
                      <Select
                        onValueChange={(val) => { setSelectedClockType(val); form.setValue("clockType", val as any); }}
                        defaultValue="EVERGREEN"
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ALL_CLOCK_TYPES.map(ct => (
                            <SelectItem key={ct} value={ct}>
                              <span>{CLOCK_TYPE_LABELS[ct].label}</span>
                              <span className="text-muted-foreground text-xs ml-2">{CLOCK_TYPE_LABELS[ct].hint}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedClockType !== "EVERGREEN" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Publish At</Label>
                          <Input type="datetime-local" {...form.register("publishAt")} className="h-8 text-xs" />
                          <p className="text-[10px] text-muted-foreground">Leave blank to publish immediately</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Expire At</Label>
                          <Input type="datetime-local" {...form.register("expireAt")} className="h-8 text-xs" />
                          <p className="text-[10px] text-muted-foreground">Worker archives at this time</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Peak Until</Label>
                          <Input type="datetime-local" {...form.register("peakUntil")} className="h-8 text-xs" />
                          <p className="text-[10px] text-muted-foreground">End of 100% freshness window</p>
                        </div>
                        {selectedClockType === "RECURRING_PULSE" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Refresh Rule</Label>
                            <Select
                              onValueChange={(val) => form.setValue("refreshRule", val)}
                              defaultValue="MONTHLY"
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cadence" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">Auto-respawn cadence</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 bg-muted/40 rounded-xl p-4 border border-border">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Resolution Rules (optional)</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Primary Source</Label>
                        <Input {...form.register("sourcePrimary")} placeholder="e.g. Yelp star rating" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Backup Source</Label>
                        <Input {...form.register("sourceBackup")} placeholder="e.g. Google Maps" className="h-8 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Formula / Scoring Rule</Label>
                      <Input {...form.register("formula")} placeholder="e.g. Average of 3 data pulls" className="h-8 text-sm" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Baseline Snapshot</Label>
                      <Input {...form.register("baselineSnapshot")} placeholder="e.g. 4.2 stars on Aug 1 2026" className="h-8 text-sm" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Void Criteria</Label>
                      <Input {...form.register("voidRule")} placeholder="e.g. Market voids if venue closes" className="h-8 text-sm" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Geography</Label>
                      <Input {...form.register("geo")} placeholder="e.g. Boston · South End" className="h-8 text-sm" />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isCreating}>
                    {isCreating ? "Launching..." : "Launch Market ⚡"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Manage Open Markets */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6 gap-4">
            <h2 className="text-2xl font-editorial font-bold shrink-0">Open Markets — Awaiting Resolution</h2>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={marketSearch}
                onChange={e => setMarketSearch(e.target.value)}
                placeholder="Search markets…"
                className="w-full pl-8 pr-8 h-9 rounded-lg border border-input bg-background text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {marketSearch && (
                <button
                  onClick={() => setMarketSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {marketSearch && (
            <p className="text-xs text-muted-foreground mb-3">
              {openMarkets.length} of {allOpenMarkets.length} markets
            </p>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : openMarkets.length > 0 ? (
            <div className="space-y-4">
              {openMarkets.map(market => {
                const isMultiChoice = market.marketFormat === 'MULTI_CHOICE';
                const isBuzzOrBoo = market.marketFormat === 'BUZZ_OR_BOO';
                const isTheCall = market.marketFormat === 'THE_CALL';
                const contenders = isMultiChoice ? parseContenders(market.description) : [];
                const theCallOptions = isTheCall ? (() => {
                  try {
                    const p = JSON.parse(market.description ?? '{}');
                    return Array.isArray(p.options) ? p.options as { key: string; label: string }[] : [];
                  } catch { return []; }
                })() : [];
                const isResolving = resolvingId === market.id;

                const isEditing = editingId === market.id;

                return (
                  <Card key={market.id} className="overflow-hidden">
                    <div className="p-5 flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row gap-4 justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                            <Badge variant="secondary">{market.category}</Badge>
                            {isMultiChoice && (
                              <Badge variant="outline" className="gap-1">
                                <Crown className="w-3 h-3" /> Buzz Battle
                              </Badge>
                            )}
                            {isBuzzOrBoo && (
                              <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300">
                                ⚡ Buzz or Boo
                              </Badge>
                            )}
                            {isTheCall && (
                              <Badge variant="outline" className="gap-1 text-cyan-600 border-cyan-300">
                                🎯 The Call
                              </Badge>
                            )}
                            {market.marketFormat === 'HOT_OR_NOT' && (
                              <Badge variant="outline" className="gap-1 text-orange-500 border-orange-300">
                                🔥 Hot or Not
                              </Badge>
                            )}
                            {market.marketFormat === 'HEAD_TO_HEAD' && (
                              <Badge variant="outline" className="gap-1 text-blue-500 border-blue-300">
                                ⚔️ Head to Head
                              </Badge>
                            )}
                            {(market as any).templateId && (
                              <Badge variant="outline" className="gap-1 text-violet-600 border-violet-300 text-[10px]">
                                <Layers className="w-2.5 h-2.5" /> From Template
                              </Badge>
                            )}
                            <span className="text-muted-foreground">ID: {market.id}</span>
                            <button
                              className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => setEditingId(isEditing ? null : market.id)}
                            >
                              <Pencil className="w-3 h-3" />
                              {isEditing ? "Close" : "Edit"}
                            </button>
                          </div>
                          <Link href={`/markets/${market.id}`}>
                            <h4 className="font-editorial font-bold text-lg hover:text-primary transition-colors">
                              {market.question}
                            </h4>
                          </Link>
                          <div className="text-sm text-muted-foreground mt-2 font-mono-numbers">
                            {market.totalPredictions} {isBuzzOrBoo ? "verdicts" : isTheCall ? "picks" : "calls"}
                            {!isMultiChoice && !isBuzzOrBoo && !isTheCall && ` · ${market.yesCount} Buzzed / ${market.noCount} Boo'd`}
                            {isBuzzOrBoo && ` · ${market.yesPercent ?? 50}% BUZZ / ${market.noPercent ?? 50}% BOO`}
                          </div>
                        </div>

                        {!isMultiChoice && !isTheCall && (
                          <div className="flex flex-col md:items-end justify-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              {isBuzzOrBoo ? "Lock Sentiment" : "Declare Outcome"}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-green-500/10 text-green-700 hover:bg-green-500 hover:text-white border-green-200"
                                onClick={() => handleResolve(market.id, 'YES')}
                                disabled={isResolving}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                {isBuzzOrBoo ? "⚡ Lock BUZZ" : "Buzzed ✓"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-red-500/10 text-red-700 hover:bg-red-500 hover:text-white border-red-200"
                                onClick={() => handleResolve(market.id, 'NO')}
                                disabled={isResolving}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                {isBuzzOrBoo ? "👎 Lock BOO" : "Boo'd ✗"}
                              </Button>
                            </div>
                            {isBuzzOrBoo && (
                              <p className="text-[10px] text-muted-foreground">Locks the current crowd sentiment</p>
                            )}
                          </div>
                        )}

                        {isTheCall && theCallOptions.length > 0 && (
                          <div className="border-t border-border pt-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Lock Crowd Verdict</p>
                            <div className="flex flex-wrap gap-2">
                              {theCallOptions.map(o => (
                                <Button
                                  key={o.key}
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 hover:bg-cyan-500 hover:text-white border-cyan-300/50"
                                  onClick={() => handleResolve(market.id, o.key)}
                                  disabled={isResolving}
                                >
                                  🎯 {o.label}
                                </Button>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">Locks the crowd snapshot — no token redistribution</p>
                          </div>
                        )}

                        {isMultiChoice && contenders.length > 0 && (
                          <div className="border-t border-border pt-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">👑 Declare Buzz Battle Winner</p>
                            <div className="flex flex-wrap gap-2">
                              {contenders.map((c: any) => (
                                <Button
                                  key={c.key}
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 hover:bg-amber-500 hover:text-white border-amber-300/50"
                                  onClick={() => handleResolve(market.id, c.key)}
                                  disabled={isResolving}
                                >
                                  👑 {c.name}
                                </Button>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">Selects the winner — locks the market</p>
                          </div>
                        )}
                      </div>


                      {isEditing && (
                        <EditMarketForm
                          market={market}
                          onClose={() => setEditingId(null)}
                          onSuccess={() => setEditingId(null)}
                        />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <p className="text-muted-foreground font-medium">No open markets.</p>
            </div>
          )}

          {/* Recently resolved / closed */}
          {recentlyResolved.length > 0 && (
            <div className="mt-10">
              <h2 className="text-xl font-editorial font-bold mb-4 text-muted-foreground">Recently Resolved</h2>
              <div className="space-y-2">
                {recentlyResolved.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-card border border-border/50">
                    <div className="flex-1 min-w-0">
                      <Link href={`/markets/${m.id}`} className="text-sm font-medium hover:text-primary transition-colors truncate block">
                        {m.question || m.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] shrink-0">{m.category}</Badge>
                        <span className="text-[11px] text-muted-foreground truncate">ID: {m.id}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.resolvedOutcome && (
                        <Badge variant="outline" className={cn(
                          "text-[10px]",
                          m.resolvedOutcome === 'YES' ? "border-green-500/40 text-green-600 bg-green-500/8" :
                          m.resolvedOutcome === 'NO' ? "border-red-500/40 text-red-600 bg-red-500/5" :
                          "border-primary/40 text-primary bg-primary/8"
                        )}>
                          {m.resolvedOutcome}
                        </Badge>
                      )}
                      <Badge variant={m.status === 'RESOLVED' ? 'default' : 'secondary'} className="text-[10px]">
                        {m.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
