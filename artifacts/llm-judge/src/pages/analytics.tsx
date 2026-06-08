import { useGetModelComparison, useGetScoreDistribution, useGetSpearmanCorrelation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Users, Brain, Flag, Download, FileText, FileJson, Printer, BookOpen, CheckCircle2, XCircle, Minus, FlaskConical, ArrowUp, ArrowDown } from "lucide-react";

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

interface FlagStat {
  flagType: string;
  count: number;
  percentage: number;
}

interface ResponseFlagEntry {
  id: number;
  responseId: number;
  flagType: string;
  source: "HUMAN" | "AUTO" | "JUDGE";
  notes: string | null;
}

// ── Shared Flag meta ──────────────────────────────────────────────────────────

const FLAG_META: Record<string, { label: string; color: string; bg: string; border: string; chartColor: string }> = {
  PROMPT_LEAKAGE: { label: "Prompt Leakage",  color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    chartColor: "#ef4444" },
  HALLUCINATION:  { label: "Hallucination",   color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", chartColor: "#a855f7" },
  OVER_VERBOSE:   { label: "Over-Verbose",    color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  chartColor: "#f59e0b" },
  FACTUAL_ERROR:  { label: "Factual Error",   color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", chartColor: "#f97316" },
  PARTIAL_ANSWER: { label: "Partial Answer",  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   chartColor: "#3b82f6" },
  OFF_TOPIC:      { label: "Off-Topic",       color: "text-slate-700",  bg: "bg-slate-50",  border: "border-slate-200",  chartColor: "#64748b" },
};

function SmallFlagBadge({ flagType }: { flagType: string }) {
  const meta = FLAG_META[flagType];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${meta.bg} ${meta.border} ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ── Research Insights ─────────────────────────────────────────────────────────

interface KeyFinding {
  id: string;
  title: string;
  value: string;
  subtext: string;
  trend: "up" | "down" | "neutral";
  insight: string;
}

interface CriticalCase {
  responseId: number;
  questionText: string;
  modelName: string;
  judgeScore?: number | null;
  humanAvgScore?: number | null;
  delta?: number;
  bias?: string;
  flagCount?: number;
}

interface JudgeReliability {
  judgeModelId: number;
  judgeModelName: string;
  n: number;
  spearmanRho: number | null;
  overratingCount: number;
  underratingCount: number;
  overratingRate: number;
  underratingRate: number;
  avgDelta: number;
}

interface ResearchInsights {
  generatedAt: string;
  summary: {
    totalResponses: number;
    totalJudgeEvals: number;
    totalHumanEvals: number;
    totalFlags: number;
    totalPairs: number;
    humanJudgeRho: number | null;
    overratingRate: number;
    underratingRate: number;
    avgJudgeScore: number | null;
    avgHumanScore: number | null;
    scoreBias: number | null;
  };
  keyFindings: KeyFinding[];
  topCriticalCases: {
    biggestDisagreement: CriticalCase | null;
    mostHallucinated: CriticalCase | null;
    mostPromptLeakage: CriticalCase | null;
    bestAgreement: CriticalCase | null;
  };
  judgeReliability: JudgeReliability[];
  flagStats: { flagType: string; count: number }[];
}

function useResearchInsights() {
  return useQuery<ResearchInsights>({
    queryKey: ["analytics", "research-insights"],
    queryFn: () =>
      fetch("/api/analytics/research-insights", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });
}

// ── Export helpers ────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(data: ResearchInsights) {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    `medeval-research-${new Date().toISOString().slice(0, 10)}.json`
  );
}

function exportCSV(data: ResearchInsights) {
  const rows: string[][] = [];
  rows.push(["Section", "Field", "Value"]);
  rows.push(["Summary", "Total Responses", String(data.summary.totalResponses)]);
  rows.push(["Summary", "Total Judge Evals", String(data.summary.totalJudgeEvals)]);
  rows.push(["Summary", "Total Human Evals", String(data.summary.totalHumanEvals)]);
  rows.push(["Summary", "Total Flags", String(data.summary.totalFlags)]);
  rows.push(["Summary", "Paired Evaluations", String(data.summary.totalPairs)]);
  rows.push(["Summary", "Human-Judge Spearman ρ", data.summary.humanJudgeRho?.toString() ?? "N/A"]);
  rows.push(["Summary", "Overrating Rate %", String(data.summary.overratingRate)]);
  rows.push(["Summary", "Underrating Rate %", String(data.summary.underratingRate)]);
  rows.push(["Summary", "Avg Judge Score", data.summary.avgJudgeScore?.toString() ?? "N/A"]);
  rows.push(["Summary", "Avg Human Score", data.summary.avgHumanScore?.toString() ?? "N/A"]);
  rows.push(["Summary", "Score Bias (Judge−Human)", data.summary.scoreBias?.toString() ?? "N/A"]);
  rows.push([]);
  rows.push(["Key Finding", "Title", "Value", "Subtext", "Insight"]);
  data.keyFindings.forEach(f => rows.push(["Key Finding", f.title, f.value, f.subtext, f.insight]));
  rows.push([]);
  rows.push(["Judge Reliability", "Judge Model", "N", "Spearman ρ", "Overrating %", "Underrating %", "Avg Δ"]);
  data.judgeReliability.forEach(j => rows.push([
    "Judge Reliability", j.judgeModelName, String(j.n),
    j.spearmanRho?.toString() ?? "N/A",
    String(j.overratingRate), String(j.underratingRate), String(j.avgDelta),
  ]));
  rows.push([]);
  rows.push(["Flag Stats", "Flag Type", "Count"]);
  data.flagStats.forEach(f => rows.push(["Flag Stats", f.flagType, String(f.count)]));

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), `medeval-research-${new Date().toISOString().slice(0, 10)}.csv`);
}

function printReport(data: ResearchInsights) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>MedEval Judge — Research Report</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 40px; color: #1a1a2e; font-size: 13px; }
  h1 { font-size: 22px; color: #16a34a; margin-bottom: 4px; }
  h2 { font-size: 15px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-top: 28px; color: #374151; }
  h3 { font-size: 13px; margin: 16px 0 6px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .green { background: #dcfce7; color: #166534; }
  .amber { background: #fef3c7; color: #92400e; }
  .red   { background: #fee2e2; color: #991b1b; }
  .meta  { color: #9ca3af; font-size: 11px; margin-bottom: 16px; }
  .kf-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .kf-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .kf-value { font-size: 22px; font-weight: 700; color: #16a34a; }
  .kf-sub { font-size: 11px; color: #9ca3af; margin: 2px 0 6px; }
  .kf-insight { font-size: 12px; color: #4b5563; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>MedEval Judge — Research Report</h1>
<p class="meta">Generated: ${new Date(data.generatedAt).toLocaleString()} &nbsp;|&nbsp;
  ${data.summary.totalJudgeEvals} judge evals &nbsp;|&nbsp;
  ${data.summary.totalHumanEvals} human evals &nbsp;|&nbsp;
  ${data.summary.totalFlags} flags &nbsp;|&nbsp;
  ${data.summary.totalPairs} paired evaluations</p>

<h2>Key Findings</h2>
<div class="kf-grid">
${data.keyFindings.map(f => `
  <div class="kf-card">
    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">${f.title}</div>
    <div class="kf-value">${f.value}</div>
    <div class="kf-sub">${f.subtext}</div>
    <div class="kf-insight">${f.insight}</div>
  </div>`).join("")}
</div>

<h2>Judge Reliability</h2>
<table><thead><tr>
  <th>Judge Model</th><th>N Pairs</th><th>Spearman ρ</th><th>Overrating %</th><th>Underrating %</th><th>Avg Δ</th>
</tr></thead><tbody>
${data.judgeReliability.map(j => `<tr>
  <td><strong>${j.judgeModelName}</strong></td>
  <td>${j.n}</td>
  <td>${j.spearmanRho?.toFixed(3) ?? "—"}</td>
  <td><span class="badge ${j.overratingRate > 40 ? "red" : j.overratingRate > 20 ? "amber" : "green"}">${j.overratingRate}%</span></td>
  <td><span class="badge ${j.underratingRate > 40 ? "red" : j.underratingRate > 20 ? "amber" : "green"}">${j.underratingRate}%</span></td>
  <td>${j.avgDelta}</td>
</tr>`).join("")}
</tbody></table>

<h2>Flag Statistics</h2>
<table><thead><tr><th>Flag Type</th><th>Count</th></tr></thead><tbody>
${data.flagStats.map(f => `<tr><td>${f.flagType.replace(/_/g," ")}</td><td>${f.count}</td></tr>`).join("")}
</tbody></table>

<h2>Top Critical Cases</h2>
${data.topCriticalCases.biggestDisagreement ? `
  <h3>Biggest Disagreement</h3>
  <table><tbody>
    <tr><td><strong>Question:</strong></td><td>${data.topCriticalCases.biggestDisagreement.questionText}</td></tr>
    <tr><td><strong>Model:</strong></td><td>${data.topCriticalCases.biggestDisagreement.modelName}</td></tr>
    <tr><td><strong>Judge Score:</strong></td><td>${data.topCriticalCases.biggestDisagreement.judgeScore}</td></tr>
    <tr><td><strong>Human Avg:</strong></td><td>${data.topCriticalCases.biggestDisagreement.humanAvgScore}</td></tr>
    <tr><td><strong>Δ:</strong></td><td>${data.topCriticalCases.biggestDisagreement.delta}</td></tr>
    <tr><td><strong>Bias:</strong></td><td>${data.topCriticalCases.biggestDisagreement.bias}</td></tr>
  </tbody></table>` : "<p style='color:#9ca3af'>No disagreements recorded yet.</p>"}

<p class="meta" style="margin-top:40px">MedEval Judge — AI Evaluation Research Platform</p>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

// ── Research Insights Section ─────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: "up" | "down" | "neutral" }) {
  if (trend === "up")      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (trend === "down")    return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  return <Minus className="h-4 w-4 text-amber-500 shrink-0" />;
}

function ResearchInsightsSection() {
  const { data, isLoading } = useResearchInsights();
  const [reliabilityExpanded, setReliabilityExpanded] = useState(true);

  const hasData = data && data.summary.totalPairs > 0;

  return (
    <div className="space-y-5">
      {/* Section header + Export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Research Insights</h2>
        </div>

        {data && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Export:</span>
            <button
              onClick={() => exportJSON(data)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <FileJson className="h-3.5 w-3.5" />
              JSON
            </button>
            <button
              onClick={() => exportCSV(data)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={() => printReport(data)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Summary ribbon */}
      {!isLoading && data && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Responses", value: data.summary.totalResponses },
            { label: "Judge Evals", value: data.summary.totalJudgeEvals },
            { label: "Human Evals", value: data.summary.totalHumanEvals },
            { label: "Paired", value: data.summary.totalPairs },
            { label: "Flags", value: data.summary.totalFlags },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center px-4 py-2 rounded-xl border border-border bg-muted/30 min-w-[72px]">
              <span className="text-xl font-bold tabular-nums">{s.value}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key Findings cards */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Key Findings</p>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.keyFindings ?? []).map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-white p-4 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">{f.title}</p>
                  <TrendIcon trend={f.trend as "up" | "down" | "neutral"} />
                </div>
                <p className={`text-2xl font-bold tabular-nums ${
                  f.trend === "up" ? "text-green-600" : f.trend === "down" ? "text-red-600" : "text-amber-600"
                }`}>{f.value}</p>
                <p className="text-[10px] text-muted-foreground">{f.subtext}</p>
                <p className="text-xs text-foreground/70 leading-relaxed pt-0.5 border-t border-border">{f.insight}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Top Critical Cases */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Critical Cases</p>
        {isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : !hasData ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Add human evaluations on the Results page to unlock critical case analysis.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Biggest Disagreement */}
            <CriticalCaseCard
              title="Biggest Disagreement"
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              borderColor="border-red-200"
              bg="bg-red-50/30"
              entry={data?.topCriticalCases.biggestDisagreement ?? null}
              badge={data?.topCriticalCases.biggestDisagreement
                ? `Δ ${data.topCriticalCases.biggestDisagreement.delta?.toFixed(1)} · ${data.topCriticalCases.biggestDisagreement.bias}`
                : null}
            />
            {/* Best Agreement */}
            <CriticalCaseCard
              title="Best Judge Agreement"
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
              borderColor="border-green-200"
              bg="bg-green-50/30"
              entry={data?.topCriticalCases.bestAgreement ?? null}
              badge={data?.topCriticalCases.bestAgreement
                ? `Δ ${data.topCriticalCases.bestAgreement.delta?.toFixed(1)} · ${data.topCriticalCases.bestAgreement.judgeScore}/5`
                : null}
            />
            {/* Most Hallucinated */}
            <CriticalCaseCard
              title="Most Hallucinations"
              icon={<XCircle className="h-3.5 w-3.5 text-purple-500" />}
              borderColor="border-purple-200"
              bg="bg-purple-50/30"
              entry={data?.topCriticalCases.mostHallucinated ?? null}
              badge={data?.topCriticalCases.mostHallucinated
                ? `${data.topCriticalCases.mostHallucinated.flagCount} flag${(data.topCriticalCases.mostHallucinated.flagCount ?? 0) > 1 ? "s" : ""}`
                : null}
            />
            {/* Most Prompt Leakage */}
            <CriticalCaseCard
              title="Prompt Leakage"
              icon={<Flag className="h-3.5 w-3.5 text-orange-500" />}
              borderColor="border-orange-200"
              bg="bg-orange-50/30"
              entry={data?.topCriticalCases.mostPromptLeakage ?? null}
              badge={data?.topCriticalCases.mostPromptLeakage
                ? `${data.topCriticalCases.mostPromptLeakage.flagCount} flag${(data.topCriticalCases.mostPromptLeakage.flagCount ?? 0) > 1 ? "s" : ""}`
                : null}
            />
          </div>
        )}
      </div>

      {/* Judge Reliability table */}
      <div>
        <button
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 hover:text-foreground transition-colors"
          onClick={() => setReliabilityExpanded(v => !v)}
        >
          Judge Reliability Summary
          {reliabilityExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <AnimatePresence>
          {reliabilityExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              {isLoading ? (
                <Skeleton className="h-24 w-full rounded-xl" />
              ) : !data || data.judgeReliability.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No judge reliability data yet. Run evaluations and add human reviews.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Judge Model</th>
                            <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">N Pairs</th>
                            <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Spearman ρ</th>
                            <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Overrating</th>
                            <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Underrating</th>
                            <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.judgeReliability.map((j, i) => (
                            <tr key={j.judgeModelId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                              <td className="px-4 py-3 font-medium">{j.judgeModelName}</td>
                              <td className="px-3 py-3 text-center font-mono text-muted-foreground">{j.n}</td>
                              <td className="px-3 py-3 text-center">
                                {j.spearmanRho != null ? (
                                  <span className={`font-bold tabular-nums ${j.spearmanRho >= 0.7 ? "text-green-600" : j.spearmanRho >= 0.4 ? "text-amber-600" : "text-red-600"}`}>
                                    {j.spearmanRho.toFixed(3)}
                                  </span>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                  j.overratingRate > 40 ? "bg-red-50 border-red-200 text-red-700"
                                  : j.overratingRate > 20 ? "bg-amber-50 border-amber-200 text-amber-700"
                                  : "bg-green-50 border-green-200 text-green-700"
                                }`}>
                                  <TrendingUp className="h-2.5 w-2.5 mr-1" />
                                  {j.overratingRate}%
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                  j.underratingRate > 40 ? "bg-red-50 border-red-200 text-red-700"
                                  : j.underratingRate > 20 ? "bg-amber-50 border-amber-200 text-amber-700"
                                  : "bg-green-50 border-green-200 text-green-700"
                                }`}>
                                  <TrendingDown className="h-2.5 w-2.5 mr-1" />
                                  {j.underratingRate}%
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center font-mono text-sm font-semibold">
                                <span className={j.avgDelta >= 2 ? "text-red-600" : j.avgDelta >= 1 ? "text-amber-600" : "text-green-600"}>
                                  {j.avgDelta.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CriticalCaseCard({
  title, icon, borderColor, bg, entry, badge,
}: {
  title: string;
  icon: React.ReactNode;
  borderColor: string;
  bg: string;
  entry: CriticalCase | null;
  badge: string | null;
}) {
  return (
    <div className={`rounded-xl border ${borderColor} ${bg} p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {icon}{title}
        </p>
        {badge && entry && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${borderColor} bg-white text-foreground`}>
            {badge}
          </span>
        )}
      </div>
      {entry ? (
        <div className="space-y-1">
          <p className="text-sm font-medium line-clamp-2 leading-snug">{entry.questionText}</p>
          <p className="text-xs text-muted-foreground font-mono">{entry.modelName}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2">No data yet</p>
      )}
    </div>
  );
}

// ── Flag Stats Section ────────────────────────────────────────────────────────

function useFlagStats() {
  return useQuery<FlagStat[]>({
    queryKey: ["analytics", "flag-stats"],
    queryFn: () =>
      fetch("/api/analytics/flag-stats", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });
}

function FlagStatsSection() {
  const { data, isLoading } = useFlagStats();

  const chartData = (data ?? []).map((d) => ({
    name: FLAG_META[d.flagType]?.label ?? d.flagType,
    count: d.count,
    percentage: d.percentage,
    flagType: d.flagType,
  }));

  const total = (data ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Flag className="h-4 w-4 text-slate-500" />
            Most Common Failure Types
          </CardTitle>
          {total > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              {total} flag{total !== 1 ? "s" : ""} total
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Flag className="h-6 w-6 mx-auto mb-2 opacity-30" />
            No flags yet. Add quality flags on the Results page to see failure patterns.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Horizontal bar chart */}
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--foreground))" fontSize={11} tickLine={false} axisLine={false} width={100} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(val: number, _name: string, props: any) => [`${val} (${props.payload.percentage}%)`, "Count"]}
                  />
                  <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} barSize={18}>
                    {chartData.map((entry) => (
                      <Cell key={entry.flagType} fill={FLAG_META[entry.flagType]?.chartColor ?? "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
              {data.map((d) => {
                const meta = FLAG_META[d.flagType];
                return (
                  <div key={d.flagType} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${meta?.bg} ${meta?.border}`}>
                    <span className={`text-xs font-semibold ${meta?.color}`}>{meta?.label ?? d.flagType}</span>
                    <span className={`text-xs font-bold ${meta?.color}`}>{d.count}</span>
                    <span className={`text-[10px] opacity-60 ${meta?.color}`}>{d.percentage}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
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

function useResponseFlagsBulk(responseIds: number[]) {
  const key = responseIds.sort().join(",");
  return useQuery<Record<number, ResponseFlagEntry[]>>({
    queryKey: ["response-flags-bulk", key],
    queryFn: () =>
      key
        ? fetch(`/api/response-flags/bulk?responseIds=${key}`, { credentials: "include" }).then((r) => r.json())
        : Promise.resolve({}),
    enabled: responseIds.length > 0,
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-white border border-border shadow-sm">
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

function DisagreementCard({
  entry,
  rank,
  flags,
}: {
  entry: DisagreementEntry;
  rank: number;
  flags: ResponseFlagEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const isCritical = (entry.disagreementDelta ?? 0) >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.04 }}
      className={`rounded-xl border overflow-hidden ${
        isCritical ? "border-red-200 bg-red-50/30" : "border-orange-200 bg-orange-50/20"
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
            {/* Quality flags for this response */}
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flags.map((f) => <SmallFlagBadge key={f.id} flagType={f.flagType} />)}
              </div>
            )}
          </div>
        </div>

        {/* Scores + delta */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <ScorePill score={entry.judgeScore} label="Judge" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Δ</span>
            <span className={`text-lg font-bold tabular-nums ${isCritical ? "text-red-600" : "text-orange-600"}`}>
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

              {/* Flags detail */}
              {flags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                    <Flag className="h-3 w-3" /> Quality Flags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {flags.map((f) => (
                      <div key={f.id} className="flex flex-col">
                        <SmallFlagBadge flagType={f.flagType} />
                        {f.notes && (
                          <span className="text-[10px] text-muted-foreground mt-0.5 pl-1 max-w-[200px] truncate" title={f.notes}>
                            {f.notes}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

  const responseIds = (data ?? []).map((d) => d.responseId);
  const { data: flagsMap = {} } = useResponseFlagsBulk(responseIds);

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
            <DisagreementCard
              key={entry.responseId}
              entry={entry}
              rank={i + 1}
              flags={flagsMap[entry.responseId] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── MCQ RAG Accuracy Comparison ───────────────────────────────────────────────

interface McqModelStat {
  modelId: number; modelName: string; n: number;
  baseCorrect: number; ragCorrect: number;
  baseAccuracy: number; ragAccuracy: number; deltaAccuracy: number;
  improved: number; worsened: number; unchanged: number;
}
interface McqPairRow {
  modelName: string; questionText: string; correctAnswer: string;
  baseAnswer: string; ragAnswer: string;
  baseCorrect: boolean; ragCorrect: boolean; flipped: boolean;
}
interface McqRagComparison {
  totalPairs: number;
  modelStats: McqModelStat[];
  pairs: McqPairRow[];
}

function useMcqRagComparison() {
  return useQuery<McqRagComparison>({
    queryKey: ["analytics", "mcq-rag-comparison"],
    queryFn: () =>
      fetch("/api/analytics/mcq-rag-comparison", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
}

function McqRagComparisonSection() {
  const { data, isLoading } = useMcqRagComparison();
  const [showTable, setShowTable] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> MCQ RAG Accuracy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data || data.totalPairs === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> MCQ RAG Accuracy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            No paired MCQ RAG / baseline responses found yet.<br />
            Run RAG Re-Inference on a dataset containing MCQ questions to enable this comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  const barData = data.modelStats.map(m => ({
    name: m.modelName,
    "Without RAG": m.baseAccuracy,
    "With RAG":    m.ragAccuracy,
  }));

  const overallBase  = data.modelStats.length
    ? data.modelStats.reduce((s, m) => s + m.baseAccuracy,  0) / data.modelStats.length : 0;
  const overallRag   = data.modelStats.length
    ? data.modelStats.reduce((s, m) => s + m.ragAccuracy,   0) / data.modelStats.length : 0;
  const overallDelta = overallRag - overallBase;

  const totalImproved  = data.modelStats.reduce((s, m) => s + m.improved,  0);
  const totalWorsened  = data.modelStats.reduce((s, m) => s + m.worsened,  0);
  const totalUnchanged = data.modelStats.reduce((s, m) => s + m.unchanged, 0);

  const flippedRows = data.pairs.filter(p => p.flipped);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          MCQ RAG Accuracy Comparison
          <Badge variant="secondary" className="text-[10px] ml-1">{data.totalPairs} MCQ pairs</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Accuracy Δ",
              value: (overallDelta >= 0 ? "+" : "") + overallDelta.toFixed(1) + "%",
              color: overallDelta > 0 ? "text-green-600" : overallDelta < 0 ? "text-red-500" : "text-muted-foreground",
              sub: "RAG vs baseline (avg)",
            },
            { label: "Flipped Correct",   value: String(totalImproved),  color: "text-green-600",        sub: "wrong→right with RAG" },
            { label: "Flipped Wrong",     value: String(totalWorsened),  color: "text-red-500",           sub: "right→wrong with RAG" },
            { label: "Unchanged",         value: String(totalUnchanged), color: "text-muted-foreground",  sub: "same outcome" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs font-medium text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Accuracy % — Without RAG vs With RAG
          </p>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} unit="%" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
                <Bar dataKey="Without RAG" fill="#94a3b8" radius={[4,4,0,0]} barSize={28} />
                <Bar dataKey="With RAG"    fill="hsl(var(--primary))" radius={[4,4,0,0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-model table */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Per-Model Summary</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Model","N","Base Acc","RAG Acc","Δ Acc","Correct→Wrong","Wrong→Correct","Unchanged"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.modelStats.map(m => (
                  <tr key={m.modelId} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{m.modelName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.n}</td>
                    <td className="px-3 py-2">{m.baseAccuracy.toFixed(1)}%</td>
                    <td className="px-3 py-2">{m.ragAccuracy.toFixed(1)}%</td>
                    <td className={`px-3 py-2 font-semibold ${m.deltaAccuracy > 0 ? "text-green-600" : m.deltaAccuracy < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {m.deltaAccuracy >= 0 ? "+" : ""}{m.deltaAccuracy.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-red-500">{m.worsened}</td>
                    <td className="px-3 py-2 text-green-600">{m.improved}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.unchanged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Flipped answers detail */}
        {flippedRows.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
              onClick={() => setShowTable(!showTable)}
            >
              <ArrowUp className="h-3.5 w-3.5 text-primary" />
              Flipped Answers — RAG Changed the Outcome ({flippedRows.length})
              {showTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showTable && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Model","Question","Correct","Baseline","RAG","Result"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flippedRows.map((r, i) => (
                      <tr key={i} className={`border-t border-border ${r.ragCorrect ? "bg-green-50/60" : "bg-red-50/60"}`}>
                        <td className="px-3 py-2 font-medium">{r.modelName}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[240px] truncate">{r.questionText}</td>
                        <td className="px-3 py-2 font-bold text-foreground">{r.correctAnswer}</td>
                        <td className={`px-3 py-2 font-mono ${r.baseCorrect ? "text-green-600" : "text-red-500"}`}>{r.baseAnswer}</td>
                        <td className={`px-3 py-2 font-mono ${r.ragCorrect ? "text-green-600" : "text-red-500"}`}>{r.ragAnswer}</td>
                        <td className="px-3 py-2">
                          {r.ragCorrect
                            ? <span className="inline-flex items-center gap-1 text-green-700 font-semibold"><ArrowUp className="h-3 w-3" />Improved</span>
                            : <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><ArrowDown className="h-3 w-3" />Worsened</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

// ── RAG Comparison ────────────────────────────────────────────────────────────

interface RagModelStat {
  modelId: number; modelName: string; n: number;
  avgScoreBefore: number; avgScoreAfter: number; avgDelta: number;
  spearmanBeforeAfter: number;
  improved: number; worsened: number; unchanged: number;
}
interface RagPairRow {
  modelName: string; questionText: string; questionType: string;
  scoreBefore: number; scoreAfter: number; delta: number;
}
interface RagNoiseCase {
  modelName: string; questionText: string;
  scoreBefore: number; scoreAfter: number; delta: number;
  ragReasoning: string | null;
}
interface RagComparison {
  totalPairs: number;
  pairs: RagPairRow[];
  modelStats: RagModelStat[];
  noiseCases: RagNoiseCase[];
}

function useRagComparison() {
  return useQuery<RagComparison>({
    queryKey: ["analytics", "rag-comparison"],
    queryFn: () =>
      fetch("/api/analytics/rag-comparison", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
}

function RagComparisonSection() {
  const { data, isLoading } = useRagComparison();
  const [showNoise, setShowNoise] = useState(false);
  const [showTable, setShowTable] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" /> RAG Impact Analysis
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data || data.totalPairs === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" /> RAG Impact Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            No paired RAG/baseline evaluations found yet.<br />
            Run RAG Re-Inference then evaluate those responses with the Judge to see the comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  const barData = data.modelStats.map(m => ({
    name: m.modelName,
    "Without RAG": m.avgScoreBefore,
    "With RAG":    m.avgScoreAfter,
  }));

  const totalImproved  = data.modelStats.reduce((s, m) => s + m.improved,  0);
  const totalWorsened  = data.modelStats.reduce((s, m) => s + m.worsened,  0);
  const totalUnchanged = data.modelStats.reduce((s, m) => s + m.unchanged, 0);
  const overallDelta   = data.modelStats.length
    ? data.modelStats.reduce((s, m) => s + m.avgDelta, 0) / data.modelStats.length
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          RAG Impact Analysis
          <Badge variant="secondary" className="text-[10px] ml-1">{data.totalPairs} paired evaluations</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Avg Δ Score",
              value: (overallDelta >= 0 ? "+" : "") + overallDelta.toFixed(3),
              color: overallDelta > 0 ? "text-green-600" : overallDelta < 0 ? "text-red-500" : "text-muted-foreground",
              sub: "RAG vs baseline",
            },
            { label: "Improved",  value: String(totalImproved),  color: "text-green-600", sub: "questions (Δ > 0)" },
            { label: "Worsened",  value: String(totalWorsened),  color: "text-red-500",   sub: "questions (Δ < 0)" },
            { label: "Unchanged", value: String(totalUnchanged), color: "text-muted-foreground", sub: "questions (Δ = 0)" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs font-medium text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>

        {/* Bar chart: avg score before vs after per model */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Average Score — Without RAG vs With RAG
          </p>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 5]} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <ReferenceLine y={3} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
                <Bar dataKey="Without RAG" fill="#94a3b8" radius={[4,4,0,0]} barSize={28} />
                <Bar dataKey="With RAG"    fill="hsl(var(--primary))" radius={[4,4,0,0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-model stats table */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Per-Model Summary</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Model","N","Avg Before","Avg After","Δ Avg","Improved","Worsened","ρ (before↔after)"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.modelStats.map(m => (
                  <tr key={m.modelId} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{m.modelName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.n}</td>
                    <td className="px-3 py-2">{m.avgScoreBefore.toFixed(2)}</td>
                    <td className="px-3 py-2">{m.avgScoreAfter.toFixed(2)}</td>
                    <td className={`px-3 py-2 font-semibold ${m.avgDelta > 0 ? "text-green-600" : m.avgDelta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {m.avgDelta >= 0 ? "+" : ""}{m.avgDelta.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 text-green-600">{m.improved}</td>
                    <td className="px-3 py-2 text-red-500">{m.worsened}</td>
                    <td className="px-3 py-2 font-mono">{m.spearmanBeforeAfter.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Noise cases */}
        {data.noiseCases.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
              onClick={() => setShowNoise(!showNoise)}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Noise Cases — RAG Hurt Performance ({data.noiseCases.length})
              {showNoise ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showNoise && (
              <div className="space-y-2">
                {data.noiseCases.map((c, i) => (
                  <div key={i} className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{c.modelName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{c.scoreBefore} → {c.scoreAfter}</span>
                        <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                          Δ {c.delta}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.questionText}</p>
                    {c.ragReasoning && (
                      <p className="text-[10px] text-muted-foreground italic border-t border-red-200 pt-1 mt-1">
                        Judge: {c.ragReasoning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full pairs table toggle */}
        <div>
          <button
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
            onClick={() => setShowTable(!showTable)}
          >
            <FileText className="h-3.5 w-3.5" />
            Full Question-Level Comparison ({data.pairs.length} rows)
            {showTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showTable && (
            <div className="mt-2 rounded-lg border border-border overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {["Model","Type","Question","Before","After","Δ"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.pairs.map((p, i) => (
                    <tr key={i} className={`border-t border-border ${p.delta < 0 ? "bg-red-50" : p.delta > 0 ? "bg-green-50/50" : ""}`}>
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{p.modelName}</td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[9px]">{p.questionType}</Badge>
                      </td>
                      <td className="px-3 py-1.5 max-w-[300px] truncate text-muted-foreground">{p.questionText}</td>
                      <td className="px-3 py-1.5 text-center font-mono">{p.scoreBefore}</td>
                      <td className="px-3 py-1.5 text-center font-mono">{p.scoreAfter}</td>
                      <td className={`px-3 py-1.5 text-center font-semibold font-mono ${p.delta > 0 ? "text-green-600" : p.delta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {p.delta > 0 ? <span className="flex items-center gap-0.5 justify-center"><ArrowUp className="h-3 w-3" />{p.delta}</span>
                          : p.delta < 0 ? <span className="flex items-center gap-0.5 justify-center"><ArrowDown className="h-3 w-3" />{Math.abs(p.delta)}</span>
                          : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
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

      {/* ── Research Insights ── */}
      <ResearchInsightsSection />

      {/* ── Flag Stats ── */}
      <FlagStatsSection />

      {/* ── Disagreement Analysis ── */}
      <DisagreementSection />

      {/* ── RAG Impact Analysis (Open-ended) ── */}
      <RagComparisonSection />

      {/* ── MCQ RAG Accuracy Comparison ── */}
      <McqRagComparisonSection />
    </motion.div>
  );
}
