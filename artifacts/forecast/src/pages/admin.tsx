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
import { Shield, CheckCircle2, XCircle, Crown } from "lucide-react";
import { Link } from "wouter";

const ALL_CATEGORIES = ["STYLE", "HOME", "CITY", "REAL_ESTATE", "WEATHER", "CULTURE", "LOCAL_PULSE"] as const;

const formSchema = z.object({
  title: z.string().min(5),
  question: z.string().min(10),
  description: z.string().optional(),
  category: z.enum(ALL_CATEGORIES),
  subcategory: z.string().min(2),
  imageUrl: z.string().url().optional().or(z.literal("")),
  resolutionSource: z.string().optional(),
  closesAt: z.string().optional(),
});

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

export default function Admin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const { data: markets, isLoading } = useAdminListMarkets({
    query: { queryKey: getAdminListMarketsQueryKey() }
  });

  const createMarket = useCreateMarket();
  const resolveMarket = useResolveMarket();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "CULTURE",
    }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setIsCreating(true);
    createMarket.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Market created successfully" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getAdminListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTrendingMarketsQueryKey() });
        setIsCreating(false);
      },
      onError: () => {
        toast({ title: "Failed to create market", variant: "destructive" });
        setIsCreating(false);
      }
    });
  };

  const handleResolve = (id: number, outcome: string) => {
    if (!confirm(`Are you sure you want to resolve this market as "${outcome}"? This cannot be undone.`)) return;

    setResolvingId(id);
    resolveMarket.mutate({ id, data: { outcome } }, {
      onSuccess: () => {
        toast({ title: `Market resolved: ${outcome}` });
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
            <h1 className="text-3xl font-editorial font-bold">Platform Admin</h1>
            <p className="text-background/70 text-sm">Manage markets and resolutions</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Market Form */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-primary/20 shadow-md">
            <CardHeader>
              <CardTitle className="font-editorial text-2xl">Create New Market</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Question (The giant text)</Label>
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subcategory</Label>
                    <Input {...form.register("subcategory")} placeholder="e.g. Cinema" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Image URL (Optional)</Label>
                  <Input {...form.register("imageUrl")} placeholder="https://..." />
                </div>

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea {...form.register("description")} placeholder="Additional context, or JSON for special formats..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Resolution Source</Label>
                    <Input {...form.register("resolutionSource")} placeholder="e.g. Official Box Office" />
                  </div>
                  <div className="space-y-2">
                    <Label>Close Date</Label>
                    <Input type="date" {...form.register("closesAt")} />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Launch Market"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Manage Open Markets */}
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-editorial font-bold mb-6">Active Markets — Needs Resolution</h2>
          
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : openMarkets.length > 0 ? (
            <div className="space-y-4">
              {openMarkets.map(market => {
                const isMultiChoice = market.marketFormat === 'MULTI_CHOICE';
                const contenders = isMultiChoice ? parseContenders(market.description) : [];
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
                                <Crown className="w-3 h-3" /> Multi-Choice
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
                            {market.totalPredictions} predictions
                            {!isMultiChoice && ` • ${market.yesCount} YES / ${market.noCount} NO`}
                          </div>
                        </div>

                        {!isMultiChoice && (
                          <div className="flex flex-col md:items-end justify-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Resolve As</span>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="bg-green-500/10 text-green-700 hover:bg-green-500 hover:text-white border-green-200"
                                onClick={() => handleResolve(market.id, 'YES')}
                                disabled={isResolving}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" /> YES
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="bg-red-500/10 text-red-700 hover:bg-red-500 hover:text-white border-red-200"
                                onClick={() => handleResolve(market.id, 'NO')}
                                disabled={isResolving}
                              >
                                <XCircle className="w-4 h-4 mr-1" /> NO
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Multi-choice contender resolution */}
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
              <p className="text-muted-foreground font-medium">No open markets found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
