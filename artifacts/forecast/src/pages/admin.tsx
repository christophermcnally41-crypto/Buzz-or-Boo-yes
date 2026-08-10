import { useState } from "react";
import { 
  useAdminListMarkets, 
  useCreateMarket, 
  useResolveMarket,
  getAdminListMarketsQueryKey,
  getListMarketsQueryKey,
  getGetTrendingMarketsQueryKey
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
import { Shield, CheckCircle2, XCircle, Crown, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";

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

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
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

  const openMarkets = markets?.markets?.filter(m => m.status === 'OPEN') ?? [];

  return (
    <div className="min-h-screen bg-muted/20 pb-24">
      <div className="bg-foreground text-background py-8">
        <div className="container mx-auto px-4 flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-editorial font-bold">BuzzOrBoo Admin</h1>
            <p className="text-background/70 text-sm">Launch markets and declare outcomes</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Market Form */}
        <div className="lg:col-span-1">
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
                      <SelectItem value="MULTI_CHOICE">⚡ Buzz Battle (3–5 contenders)</SelectItem>
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
        </div>

        {/* Manage Open Markets */}
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-editorial font-bold mb-6">Open Markets — Awaiting Resolution</h2>

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
                            <span className="text-muted-foreground">ID: {market.id}</span>
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
                      </div>

                      {isMultiChoice && contenders.length > 0 && (
                        <div className="border-t border-border pt-4">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Declare Winner</p>
                          <div className="flex flex-wrap gap-2">
                            {contenders.map(c => (
                              <Button
                                key={c.key}
                                size="sm"
                                variant="outline"
                                className="gap-1.5 hover:bg-primary hover:text-primary-foreground border-primary/30"
                                onClick={() => handleResolve(market.id, c.key)}
                                disabled={isResolving}
                              >
                                <Crown className="w-3 h-3" /> {c.name}
                              </Button>
                            ))}
                          </div>
                        </div>
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
        </div>
      </div>
    </div>
  );
}
