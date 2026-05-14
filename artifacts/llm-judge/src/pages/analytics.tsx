import { useGetModelComparison, useGetScoreDistribution, useGetSpearmanCorrelation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Users, Brain } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DisagreementEntry {
  responseId: number;
  questionText: string;
  responseText: string;
  modelName: string;
  judgeScore: number | null;
  judgeReasoning: string | null;
  judgeModelName: string | null;
  humanAvgScore: number | null;
  humanEvalCount: number;
  humanReasonings: string[];
  disagreementDelta: number | null;
  bias: "overrating" | "underrating" | null;
}

// ── Disagreement Analysis ─────────────────────────────────────────────────────

function useDisagreements(threshold: number, limit: number) {
  return useQuery<DisagreementEntry[]>({
    queryKey: ["analytics", "disagreements", threshold, limit],
    queryFn: () =>
      fetch(`/api/analytics/disagreements?threshold=${threshold}&limit=${limit}`, {
        credentials: "include",
      }).then((r) => r.json()),
    staleTime: 30_000,
  });
}

const SCORE_DOT: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-400",
  3: "bg-yellow-400",
  4: "bg-blue-500",
  5: "bg-green-500",
};

function ScorePill({ score, label }: { score: number | null; label: string }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const rounded = Math.round(score);
  const dotClass = SCORE_DOT[Math.min(5, Math.max(1, rounded))] ?? "bg-gray-400";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-white border border-border shadow-sm`}>
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        {typeof score === "number" && !Number.isInteger(score) ? score.toFixed(1) : score}
        <span className="text-xs text-muted-foreground font-normal">/5</span>
      </span>
    </div>
  );
}

function BiasBadge({ bias }: { bias: "overrating" | "underrating" | null }) {
  if (!bias) return null;
  return bias === "overrating" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
      <TrendingUp className="h-3 w-3" />
      Overrating
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700">
      <TrendingDown className="h-3 w-3" />
      Underrating
    </span>
  );
}

function DisagreementCard({ entry, rank }: { entry: DisagreementEntry; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const isCritical = (entry.disagreementDelta ?? 0) >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.04 }}
      className={`rounded-xl border overflow-hidden ${
        isCritical
          ? "border-red-200 bg-red-50/30"
          : "border-orange-200 bg-orange-50/20"
      }`}
    >
      {/* Header row */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Rank badge */}
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
          isCritical ? "bg-red-100 border-red-300 text-red-700" : "bg-orange-100 border-orange-300 text-orange-700"
        }`}>
          {rank}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-medium leading-snug line-clamp-2">{entry.questionText}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
              {entry.modelName}
            </span>
            {entry.judgeModelName && (
              <span className="text-xs text-muted-foreground">
                Judge: <span className="font-medium">{entry.judgeModelName}</span>
              </span>
            )}
            <BiasBadge bias={entry.bias} />
            {entry.humanEvalCount > 1 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {entry.humanEvalCount} reviewers
              </span>
            )}
          </div>
        </div>

        {/* Scores + delta */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <ScorePill score={entry.judgeScore} label="Judge" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Δ</span>
            <span className={`text-lg font-bold tabular-nums ${
              isCritical ? "text-red-600" : "text-orange-600"
            }`}>
              {entry.disagreementDelta?.toFixed(1)}
            </span>
          </div>
          <ScorePill score={entry.humanAvgScore} label="Human" />
          <div className="ml-1 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="p-4 pt-3 space-y-3 bg-white/60">
              {/* Model response */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Model Response</p>
                <div className="text-sm leading-relaxed bg-blue-50 border border-blue-100 rounded-lg p-3 text-blue-900 max-h-[120px] overflow-y-auto">
                  {entry.responseText}
                </div>
              </div>

              {/* Judge reasoning */}
              {entry.judgeReasoning && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    Judge Reasoning
                  </p>
                  <div className="text-sm leading-relaxed bg-amber-50 border border-amber-100 rounded-lg p-3 text-amber-900 max-h-[120px] overflow-y-auto whitespace-pre-wrap">
                    {entry.judgeReasoning}
                  </div>
                </div>
              )}

              {/* Human reasonings */}
              {entry.humanReasonings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Human Reasoning{entry.humanReasonings.length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-1.5">
                    {entry.humanReasonings.map((r, i) => (
                      <div key={i} className="text-sm leading-relaxed bg-violet-50 border border-violet-100 rounded-lg p-3 text-violet-900">
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DisagreementSection() {
  const [threshold, setThreshold] = useState(2);
  const [limit] = useState(10);
  const { data, isLoading } = useDisagreements(threshold, limit);

  const overrating = data?.filter((d) => d.bias === "overrating").length ?? 0;
  const underrating = data?.filter((d) => d.bias === "underrating").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <h2 className="text-base font-semibold">Disagreement Analysis</h2>
          <span className="text-xs text-muted-foreground">— Top 10 Most Disagreed Responses</span>
        </div>

        {/* Threshold selector */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Min Δ:</span>
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              onClick={() => setThreshold(t)}
              className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                threshold === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white border-border hover:border-primary/50"
              }`}
            >
              ≥{t}
            </button>
          ))}
        </div>
      </div>

      {/* Summary pills */}
      {!isLoading && data && data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted border border-border">
            <span className="font-bold text-foreground">{data.length}</span> disagreements found
          </span>
          {overrating > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
              <TrendingUp className="h-3 w-3" />
              {overrating} Overrating
            </span>
          )}
          {underrating > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700">
              <TrendingDown className="h-3 w-3" />
              {underrating} Underrating
            </span>
          )}
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No disagreements found with Δ ≥ {threshold}.<br />
            <span className="text-xs">Add human evaluations on the Results page to enable this analysis.</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((entry, i) => (
            <DisagreementCard key={entry.responseId} entry={entry} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Analytics Page ───────────────────────────────────────────────────────

export default function Analytics() {
  const { data: comparison, isLoading: isLoadingComparison } = useGetModelComparison();
  const { data: distribution, isLoading: isLoadingDist } = useGetScoreDistribution();
  const { data: spearman, isLoading: isLoadingSpearman } = useGetSpearmanCorrelation();

  const distChartData = (() => {
    if (!distribution) return [];
    const modelMap = new Map<string, any>();
    distribution.forEach(row => {
      if (!modelMap.has(row.modelName)) {
        modelMap.set(row.modelName, { modelName: row.modelName, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
      }
      const item = modelMap.get(row.modelName);
      item[row.score.toString()] = row.count;
    });
    return Array.from(modelMap.values());
  })();

  const SCORE_COLORS = {
    "1": "#ef4444",
    "2": "#f97316",
    "3": "#eab308",
    "4": "#3b82f6",
    "5": "#22c55e",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Statistical insights and model comparison</p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Spearman Correlation</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSpearman ? (
              <Skeleton className="h-16 w-full" />
            ) : spearman && spearman.correlation !== null ? (
              <div>
                <p className="text-4xl font-bold text-primary">{spearman.correlation?.toFixed(3)}</p>
                <p className="text-xs text-muted-foreground mt-1">ρ · {spearman.interpretation}</p>
                <p className="text-xs text-muted-foreground mt-0.5">n={spearman.sampleSize} · p={spearman.pValue?.toFixed(4)}</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">Insufficient data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">MCQ Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSpearman ? (
              <Skeleton className="h-16 w-full" />
            ) : spearman && spearman.mcqAccuracy !== null ? (
              <div>
                <p className="text-4xl font-bold text-foreground">{(spearman.mcqAccuracy * 100).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">Exact match rate on MCQ questions</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">No MCQ records</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Inference Latency</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-1">
            {isLoadingComparison ? (
              <div className="px-6 py-2"><Skeleton className="h-16 w-full" /></div>
            ) : comparison && comparison.length > 0 ? (
              <div>
                {comparison.map(m => (
                  <div key={m.modelId} className="flex justify-between items-center py-2 px-6 border-b border-border last:border-0">
                    <span className="text-sm font-medium truncate mr-2">{m.modelName}</span>
                    <span className="text-sm font-mono text-primary shrink-0">
                      {m.avgInferenceMs ? `${Math.round(m.avgInferenceMs)}ms` : "N/A"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-4 text-sm text-muted-foreground">No latency data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Average Score by Model</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px] pt-2">
            {isLoadingComparison ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 5]} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="modelName" type="category" stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} width={120} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: "hsl(var(--primary))" }}
                  />
                  <ReferenceLine x={3} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.6} />
                  <Bar dataKey="avgScore" name="Avg Score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px] pt-2">
            {isLoadingDist ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="modelName" stroke="hsl(var(--foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} iconType="circle" />
                  <Bar dataKey="1" stackId="a" fill={SCORE_COLORS["1"]} name="Score 1" />
                  <Bar dataKey="2" stackId="a" fill={SCORE_COLORS["2"]} name="Score 2" />
                  <Bar dataKey="3" stackId="a" fill={SCORE_COLORS["3"]} name="Score 3" />
                  <Bar dataKey="4" stackId="a" fill={SCORE_COLORS["4"]} name="Score 4" />
                  <Bar dataKey="5" stackId="a" fill={SCORE_COLORS["5"]} name="Score 5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Disagreement Analysis ── */}
      <DisagreementSection />
    </motion.div>
  );
}
