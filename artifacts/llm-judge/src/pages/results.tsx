import { useGetResults, useListModels, useListDatasets, getGetResultsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChevronRight, Filter, Download, Trash2, RotateCcw, CheckCircle2, XCircle, Eraser, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { currentUnifiedUser } from "@/components/auth-gate";

// ── Types ────────────────────────────────────────────────────────────────────

type ModelResponseEntry = {
  responseId: number;
  modelName: string;
  responseText: string;
  inferenceTimeMs: number | null;
  score: number | null;
  judgeModelName: string | null;
  evaluationId: number | null;
  evaluatedAt: string | null;
  mcqScore: string | null;
  mcqCorrect: string | null;
  reasoning: string | null;
  responseCreatedBy: string | null;
  evaluationCreatedBy: string | null;
  mustHaveScore: number | null;
};

type QuestionGroup = {
  questionId: number;
  questionText: string;
  goldAnswer: string;
  questionType: string;
  datasetName: string;
  mcqCorrect: string | null;
  referenceAnswers: { answerText: string; judgeModelName: string }[];
  modelResponses: ModelResponseEntry[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupRowsByQuestion(rows: any[]): QuestionGroup[] {
  const map = new Map<number, QuestionGroup>();
  for (const row of rows) {
    if (!map.has(row.questionId)) {
      map.set(row.questionId, {
        questionId: row.questionId,
        questionText: row.questionText,
        goldAnswer: row.goldAnswer,
        questionType: row.questionType,
        datasetName: row.datasetName ?? "",
        mcqCorrect: row.mcqCorrect ?? null,
        referenceAnswers: row.referenceAnswers ?? [],
        modelResponses: [],
      });
    }
    const group = map.get(row.questionId)!;
    if ((row.referenceAnswers?.length ?? 0) > (group.referenceAnswers?.length ?? 0)) {
      group.referenceAnswers = row.referenceAnswers ?? [];
    }
    if (row.mcqCorrect && !group.mcqCorrect) group.mcqCorrect = row.mcqCorrect;
    if (row.responseId) {
      if (!group.modelResponses.find(mr => mr.responseId === row.responseId)) {
        group.modelResponses.push({
          responseId: row.responseId,
          modelName: row.modelName ?? "",
          responseText: row.responseText ?? "",
          inferenceTimeMs: row.inferenceTimeMs ?? null,
          score: row.score ?? null,
          judgeModelName: row.judgeModelName ?? null,
          evaluationId: row.evaluationId ?? null,
          evaluatedAt: row.evaluatedAt ?? null,
          mcqScore: row.mcqScore ?? null,
          mcqCorrect: row.mcqCorrect ?? null,
          reasoning: row.reasoning ?? null,
          responseCreatedBy: row.responseCreatedBy ?? null,
          evaluationCreatedBy: row.evaluationCreatedBy ?? null,
          mustHaveScore: row.mustHaveScore ?? null,
        });
      }
    }
  }
  return [...map.values()];
}

function isMCQCorrect(mr: ModelResponseEntry, correctAnswer: string | null): boolean {
  if (mr.mcqScore != null) return mr.mcqScore.toLowerCase() === "true";
  return !!(correctAnswer && mr.responseText?.trim().toUpperCase() === correctAnswer.trim().toUpperCase());
}

function escapeCSV(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportOpenEndedCSV(rows: any[]) {
  const headers = ["model", "dataset", "question", "gold_answer", "response", "must_have_score", "reference_answer", "score", "judge_model", "reasoning"];
  const lines = [headers.join(","), ...rows.map((r) => [
    escapeCSV(r.modelName), escapeCSV(r.datasetName), escapeCSV(r.questionText),
    escapeCSV(r.goldAnswer), escapeCSV(r.responseText), escapeCSV(r.mustHaveScore ?? ""),
    escapeCSV(r.referenceAnswer ?? ""), escapeCSV(r.score ?? ""),
    escapeCSV(r.judgeModelName ?? ""), escapeCSV(r.reasoning ?? ""),
  ].join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `open_ended_results_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

function exportMCQCSV(rows: any[]) {
  const headers = ["model", "dataset", "question", "gold_answer", "prediction", "correct_letter", "mcq_score"];
  const lines = [headers.join(","), ...rows.map((r) => [
    escapeCSV(r.modelName), escapeCSV(r.datasetName), escapeCSV(r.questionText),
    escapeCSV(r.goldAnswer), escapeCSV(r.responseText), escapeCSV(r.mcqCorrect ?? ""), escapeCSV(r.mcqScore ?? ""),
  ].join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `mcq_results_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

type DeleteTarget = { kind: "response"; responseId: number } | { kind: "evaluation"; evaluationId: number };
function canDelete(createdBy: string | null | undefined): boolean {
  if (createdBy === null || createdBy === undefined) return true;
  return currentUnifiedUser?.id === createdBy;
}

const SCORE_META: Record<number, { label: string; bg: string; text: string; bar: string }> = {
  5: { label: "Excellent", bg: "bg-green-50",  text: "text-green-700",  bar: "bg-green-500"  },
  4: { label: "Good",      bg: "bg-blue-50",   text: "text-blue-700",   bar: "bg-blue-500"   },
  3: { label: "Partial",   bg: "bg-amber-50",  text: "text-amber-700",  bar: "bg-amber-500"  },
  2: { label: "Weak",      bg: "bg-orange-50", text: "text-orange-700", bar: "bg-orange-500" },
  1: { label: "Critical",  bg: "bg-red-50",    text: "text-red-700",    bar: "bg-red-500"    },
};

// ── Summary Stats Panel ───────────────────────────────────────────────────────

function SummaryStats({
  openEndedGroups,
  mcqGroups,
  activeTab,
}: {
  openEndedGroups: QuestionGroup[];
  mcqGroups: QuestionGroup[];
  activeTab: "open_ended" | "mcq";
}) {
  const stats = useMemo(() => {
    if (activeTab === "mcq") {
      // Per-model MCQ accuracy
      const modelMap = new Map<string, { correct: number; total: number }>();
      for (const g of mcqGroups) {
        const correctAnswer = g.mcqCorrect ?? g.goldAnswer;
        for (const mr of g.modelResponses) {
          if (!modelMap.has(mr.modelName)) modelMap.set(mr.modelName, { correct: 0, total: 0 });
          const entry = modelMap.get(mr.modelName)!;
          entry.total++;
          if (isMCQCorrect(mr, correctAnswer)) entry.correct++;
        }
      }
      const models = [...modelMap.entries()]
        .map(([name, v]) => ({ name, accuracy: v.total > 0 ? v.correct / v.total : 0, correct: v.correct, total: v.total }))
        .sort((a, b) => b.accuracy - a.accuracy);

      const totalQuestions = mcqGroups.length;
      const totalResponses = mcqGroups.reduce((s, g) => s + g.modelResponses.length, 0);

      return { type: "mcq" as const, models, totalQuestions, totalResponses };
    } else {
      // Per-model open-ended avg score
      const modelMap = new Map<string, { scores: number[]; totalResponses: number }>();
      const scoreDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      for (const g of openEndedGroups) {
        for (const mr of g.modelResponses) {
          if (!modelMap.has(mr.modelName)) modelMap.set(mr.modelName, { scores: [], totalResponses: 0 });
          const entry = modelMap.get(mr.modelName)!;
          entry.totalResponses++;
          if (mr.score != null) {
            entry.scores.push(mr.score);
            scoreDist[mr.score] = (scoreDist[mr.score] ?? 0) + 1;
          }
        }
      }

      const models = [...modelMap.entries()]
        .map(([name, v]) => ({
          name,
          avg: v.scores.length > 0 ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : null,
          evaluated: v.scores.length,
          total: v.totalResponses,
        }))
        .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

      const totalEvaluated = Object.values(scoreDist).reduce((a, b) => a + b, 0);

      return { type: "open" as const, models, scoreDist, totalEvaluated };
    }
  }, [openEndedGroups, mcqGroups, activeTab]);

  if (activeTab === "open_ended" && stats.type === "open") {
    const { models, scoreDist, totalEvaluated } = stats;
    if (models.length === 0) return null;

    return (
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mb-4">
        {/* Model comparison row */}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(models.length, 4)}, 1fr)` }}>
          {models.map((m, i) => (
            <Card key={m.name} className={`relative overflow-hidden ${i === 0 && m.avg != null ? "ring-2 ring-primary/30" : ""}`}>
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate" title={m.name}>{m.name}</p>
                    {i === 0 && m.avg != null && (
                      <Badge className="text-[9px] h-4 px-1.5 mt-0.5 bg-primary/10 text-primary border-0">Top</Badge>
                    )}
                  </div>
                  {m.avg != null ? (
                    <ScoreBadge score={m.avg} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="mt-2.5 space-y-1">
                  {m.avg != null && (
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${(m.avg / 5) * 100}%` }}
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {m.evaluated} / {m.total} evaluated
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Score distribution bar */}
        {totalEvaluated > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Score Distribution — {totalEvaluated} evaluations
                </p>
              </div>
              <div className="flex gap-1.5 h-14 items-end">
                {[5, 4, 3, 2, 1].map((s) => {
                  const count = scoreDist[s] ?? 0;
                  const pct = totalEvaluated > 0 ? (count / totalEvaluated) * 100 : 0;
                  const meta = SCORE_META[s];
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">{count > 0 ? count : ""}</span>
                      <div
                        className={`w-full rounded-t-sm ${meta.bar} transition-all min-h-[2px]`}
                        style={{ height: `${Math.max(2, pct * 0.42)}rem` }}
                        title={`Score ${s}: ${count} (${pct.toFixed(0)}%)`}
                      />
                      <span className={`text-[10px] font-bold ${meta.text}`}>{s}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                {[5, 4, 3, 2, 1].map((s) => {
                  const count = scoreDist[s] ?? 0;
                  const pct = totalEvaluated > 0 ? (count / totalEvaluated) * 100 : 0;
                  const meta = SCORE_META[s];
                  return (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-sm ${meta.bar}`} />
                      <span className="text-[10px] text-muted-foreground">{meta.label}: {pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    );
  }

  if (activeTab === "mcq" && stats.type === "mcq") {
    const { models, totalQuestions, totalResponses } = stats;
    if (models.length === 0) return null;

    return (
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mb-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(models.length, 4)}, 1fr)` }}>
          {models.map((m, i) => (
            <Card key={m.name} className={i === 0 ? "ring-2 ring-blue-200" : ""}>
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate" title={m.name}>{m.name}</p>
                    {i === 0 && (
                      <Badge className="text-[9px] h-4 px-1.5 mt-0.5 bg-blue-100 text-blue-700 border-0">Top</Badge>
                    )}
                  </div>
                  <span className={`text-lg font-bold ${m.accuracy >= 0.8 ? "text-green-600" : m.accuracy >= 0.5 ? "text-amber-600" : "text-red-600"}`}>
                    {(m.accuracy * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2.5 space-y-1">
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${m.accuracy >= 0.8 ? "bg-green-500" : m.accuracy >= 0.5 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${m.accuracy * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{m.correct} / {m.total} correct</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-muted/30">
          <CardContent className="p-3 flex items-center gap-6">
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{totalQuestions}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
            <div className="w-px bg-border h-8" />
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{totalResponses}</p>
              <p className="text-xs text-muted-foreground">Responses</p>
            </div>
            {models.length > 0 && (
              <>
                <div className="w-px bg-border h-8" />
                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">{(models[0].accuracy * 100).toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Best accuracy</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Results() {
  const [datasetId, setDatasetId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"open_ended" | "mcq">("open_ended");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: models } = useListModels();
  const { data: datasets } = useListDatasets();

  const queryParams = {
    datasetId: datasetId !== "all" && datasetId !== "" ? parseInt(datasetId) : undefined,
    modelId: modelId !== "all" && modelId !== "" ? parseInt(modelId) : undefined,
  };

  const { data: results, isLoading } = useGetResults(queryParams, {
    query: { queryKey: getGetResultsQueryKey(queryParams) }
  });

  const openEndedRows = results?.filter((r) => r.questionType === "OPEN_ENDED") ?? [];
  const mcqRows = results?.filter((r) => r.questionType === "MCQ") ?? [];

  const openEndedGroups = groupRowsByQuestion(openEndedRows);
  const mcqGroups = groupRowsByQuestion(mcqRows);

  async function clearAllResults() {
    setIsClearing(true);
    try {
      const res = await fetch("/api/results/clear-all", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast({ title: "Cleared", description: `Deleted ${data.deletedResponses} responses and ${data.deletedRefs} reference answers.` });
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Clear failed", description: String(e), variant: "destructive" });
    } finally {
      setIsClearing(false);
      setShowClearAll(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "response") {
        const res = await fetch(`/api/responses/${deleteTarget.responseId}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error);
        toast({ title: "Response deleted", description: "The response and its evaluation have been removed." });
      } else {
        const res = await fetch(`/api/evaluations/${deleteTarget.evaluationId}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error);
        toast({ title: "Evaluation cleared", description: "The score has been removed. You can re-evaluate this response." });
      }
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Results</h1>
          <p className="text-sm text-muted-foreground mt-1">Compare all model responses per question</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={datasetId} onValueChange={setDatasetId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All datasets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All datasets</SelectItem>
              {datasets?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {models?.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.modelName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "open_ended" | "mcq")}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <TabsList>
            <TabsTrigger value="open_ended" className="gap-1.5">
              Open-ended
              {!isLoading && (
                <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
                  {openEndedGroups.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="mcq" className="gap-1.5">
              MCQ
              {!isLoading && (
                <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">
                  {mcqGroups.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0"
              disabled={activeTab === "open_ended" ? openEndedRows.length === 0 : mcqRows.length === 0}
              onClick={() => activeTab === "open_ended" ? exportOpenEndedCSV(openEndedRows) : exportMCQCSV(mcqRows)}>
              <Download className="h-3.5 w-3.5" />Export CSV
            </Button>
            <Button variant="outline" size="sm"
              className="gap-1.5 shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              disabled={!results || results.length === 0}
              onClick={() => setShowClearAll(true)}>
              <Eraser className="h-3.5 w-3.5" />Clear All
            </Button>
          </div>
        </div>

        {/* ── Stats panel (computed from current data) ── */}
        {!isLoading && (
          <SummaryStats
            openEndedGroups={openEndedGroups}
            mcqGroups={mcqGroups}
            activeTab={activeTab}
          />
        )}

        {/* ── Open-ended tab ── */}
        <TabsContent value="open_ended" className="mt-0">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><Skeleton className="h-[400px] w-full" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 pl-3" />
                        <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                        <TableHead className="w-[35%]">Question</TableHead>
                        <TableHead className="w-[35%]">Model Responses</TableHead>
                        <TableHead className="text-right pr-4">Avg Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openEndedGroups.map((group, idx) => (
                        <OpenEndedQuestionRow
                          key={group.questionId}
                          group={group}
                          questionNumber={idx + 1}
                          onClearEvaluation={(id) => setDeleteTarget({ kind: "evaluation", evaluationId: id })}
                          onDeleteResponse={(id) => setDeleteTarget({ kind: "response", responseId: id })}
                        />
                      ))}
                      {openEndedGroups.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-48 text-center text-sm text-muted-foreground">
                            No open-ended responses found. Import responses or adjust filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MCQ tab ── */}
        <TabsContent value="mcq" className="mt-0">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><Skeleton className="h-[400px] w-full" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 pl-3" />
                        <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                        <TableHead className="w-[40%]">Question</TableHead>
                        <TableHead>SLM Predictions</TableHead>
                        <TableHead className="text-right pr-4">Accuracy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mcqGroups.map((group, idx) => (
                        <MCQQuestionRow
                          key={group.questionId}
                          group={group}
                          questionNumber={idx + 1}
                          onDeleteResponse={(id) => setDeleteTarget({ kind: "response", responseId: id })}
                        />
                      ))}
                      {mcqGroups.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-48 text-center text-sm text-muted-foreground">
                            No MCQ responses found. Import responses or adjust filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showClearAll} onOpenChange={(o) => !o && setShowClearAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all results?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p>The following will be permanently deleted:</p>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All model responses</li>
                  <li>All judge evaluations (cascaded)</li>
                  <li>All reference answers</li>
                </ul>
                <p className="text-sm font-medium text-foreground pt-1">Kept intact: Questions, Datasets, and Models.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAll(false)} disabled={isClearing}>Cancel</Button>
            <Button variant="destructive" onClick={clearAllResults} disabled={isClearing}>
              {isClearing ? "Clearing…" : "Clear all results"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget?.kind === "evaluation"} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear evaluation score?</DialogTitle>
            <DialogDescription>This removes the judge score and reasoning. The response stays — you can re-evaluate afterwards.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Clearing…" : "Clear score"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget?.kind === "response"} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this response?</DialogTitle>
            <DialogDescription>This permanently removes the model response and its evaluation.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// ── MCQ Question Row ──────────────────────────────────────────────────────────

function MCQQuestionRow({
  group,
  questionNumber,
  onDeleteResponse,
}: {
  group: QuestionGroup;
  questionNumber: number;
  onDeleteResponse: (id: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const correctAnswer = group.mcqCorrect ?? group.goldAnswer;

  const totalModels = group.modelResponses.length;
  const correctCount = group.modelResponses.filter(mr => isMCQCorrect(mr, correctAnswer)).length;

  return (
    <>
      <TableRow
        className={`cursor-pointer transition-colors ${isOpen ? "bg-blue-50/60 border-l-2 border-l-blue-400" : "hover:bg-muted/40"}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="pl-3">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90 text-blue-500" : ""}`} />
        </TableCell>
        <TableCell className="align-top py-3 text-center">
          <span className="text-xs font-mono font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{questionNumber}</span>
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="text-sm line-clamp-2 leading-relaxed">{group.questionText}</p>
          <Badge variant="outline" className="text-xs mt-1 font-normal">{group.datasetName}</Badge>
        </TableCell>
        <TableCell className="align-top py-3">
          <div className="flex flex-wrap gap-1.5">
            {group.modelResponses.map(mr => {
              const correct = isMCQCorrect(mr, correctAnswer);
              const letter = mr.responseText?.trim().slice(0, 1).toUpperCase() || "?";
              return (
                <span
                  key={mr.responseId}
                  title={`${mr.modelName}: ${letter}`}
                  className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    correct ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"
                  }`}
                >
                  {letter}
                  {correct ? <CheckCircle2 className="h-2.5 w-2.5 ml-0.5" /> : <XCircle className="h-2.5 w-2.5 ml-0.5" />}
                </span>
              );
            })}
            {group.referenceAnswers.map((ra, i) => (
              <span key={`judge-${i}`} title={`${ra.judgeModelName}: ${ra.answerText?.slice(0,1)?.toUpperCase()}`}
                className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
                {ra.answerText?.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
            ))}
          </div>
        </TableCell>
        <TableCell className="align-top py-3 text-right pr-4">
          {totalModels > 0 && (
            <div className="flex items-center justify-end gap-1.5">
              <span className={`text-sm font-bold ${correctCount === totalModels ? "text-green-600" : correctCount === 0 ? "text-red-600" : "text-amber-600"}`}>
                {correctCount}/{totalModels}
              </span>
              <span className="text-xs text-muted-foreground">correct</span>
            </div>
          )}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isOpen && (
          <TableRow className="bg-blue-50/20 hover:bg-blue-50/20">
            <TableCell colSpan={5} className="p-0">
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="p-6 border-l-2 border-l-blue-400 ml-10 space-y-5">

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question</p>
                    <div className="text-sm leading-relaxed bg-white border border-border rounded-lg p-3.5">{group.questionText}</div>
                  </div>

                  <div className="overflow-x-auto pb-1">
                    <div className="inline-flex gap-3 min-w-max">
                      <div className="flex flex-col items-center gap-1.5 w-20">
                        <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide text-center">Gold</p>
                        <div className="w-20 h-16 flex items-center justify-center text-2xl font-mono font-bold bg-green-50 border-2 border-green-300 rounded-xl text-green-800">
                          {correctAnswer}
                        </div>
                      </div>
                      <div className="w-px bg-border self-stretch mx-1" />
                      {group.modelResponses.map(mr => {
                        const correct = isMCQCorrect(mr, correctAnswer);
                        const letter = mr.responseText?.trim().slice(0, 1).toUpperCase() || "?";
                        return (
                          <div key={mr.responseId} className="flex flex-col items-center gap-1.5 w-20">
                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide text-center truncate w-20" title={mr.modelName}>
                              {mr.modelName.split(/[-_]/)[0]}
                            </p>
                            <p className="text-[9px] text-muted-foreground text-center truncate w-20" title={mr.modelName}>{mr.modelName}</p>
                            <div className={`w-20 h-16 flex flex-col items-center justify-center gap-1 text-xl font-mono font-bold rounded-xl border-2 ${
                              correct ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-700"
                            }`}>
                              {letter}
                              {correct ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            </div>
                          </div>
                        );
                      })}
                      {group.referenceAnswers.length > 0 && <div className="w-px bg-amber-200 self-stretch mx-1" />}
                      {group.referenceAnswers.map((ra, i) => (
                        <div key={i} className="flex flex-col items-center gap-1.5 w-20">
                          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide text-center">Judge</p>
                          <p className="text-[9px] text-amber-600 text-center truncate w-20" title={ra.judgeModelName}>{ra.judgeModelName}</p>
                          <div className="w-20 h-16 flex items-center justify-center text-2xl font-mono font-bold bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-800">
                            {ra.answerText?.trim().slice(0, 1).toUpperCase() || "?"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {group.modelResponses.some(mr => mr.inferenceTimeMs || canDelete(mr.responseCreatedBy)) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                      {group.modelResponses.map(mr => {
                        const correct = isMCQCorrect(mr, correctAnswer);
                        return (
                          <div key={mr.responseId}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                              correct ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                            }`}>
                            <div className="min-w-0">
                              <p className="font-semibold truncate text-foreground" title={mr.modelName}>{mr.modelName}</p>
                              {mr.inferenceTimeMs && <p className="text-muted-foreground">{mr.inferenceTimeMs}ms</p>}
                            </div>
                            {canDelete(mr.responseCreatedBy) && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-100"
                                onClick={(e) => { e.stopPropagation(); onDeleteResponse(mr.responseId); }} title="Delete response">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Open-ended Question Row ───────────────────────────────────────────────────

function OpenEndedQuestionRow({
  group,
  questionNumber,
  onClearEvaluation,
  onDeleteResponse,
}: {
  group: QuestionGroup;
  questionNumber: number;
  onClearEvaluation: (id: number) => void;
  onDeleteResponse: (id: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModelIdx, setActiveModelIdx] = useState(0);

  const evaluatedModels = group.modelResponses.filter(mr => mr.score != null);
  const avgScore = evaluatedModels.length > 0
    ? evaluatedModels.reduce((sum, mr) => sum + (mr.score ?? 0), 0) / evaluatedModels.length
    : null;

  return (
    <>
      <TableRow
        className={`cursor-pointer transition-colors ${isOpen ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="pl-3">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90 text-primary" : ""}`} />
        </TableCell>
        <TableCell className="align-top py-3 text-center">
          <span className="text-xs font-mono font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{questionNumber}</span>
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="text-sm line-clamp-2 leading-relaxed">{group.questionText}</p>
          <Badge variant="outline" className="text-xs mt-1 font-normal">{group.datasetName}</Badge>
        </TableCell>
        <TableCell className="align-top py-3">
          <div className="flex flex-wrap gap-1.5">
            {group.modelResponses.map(mr => (
              <span key={mr.responseId} title={mr.modelName}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-blue-50 border-blue-200 text-blue-700 font-medium">
                <span className="max-w-[80px] truncate">{mr.modelName.split(/[-_]/)[0]}</span>
                {mr.score != null && <span className="font-mono font-bold text-[10px]">{mr.score}/5</span>}
              </span>
            ))}
          </div>
        </TableCell>
        <TableCell className="align-top py-3 text-right pr-4">
          {avgScore != null ? <ScoreBadge score={avgScore} /> : <span className="text-xs text-muted-foreground">—</span>}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isOpen && (
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableCell colSpan={5} className="p-0">
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="p-6 border-l-2 border-l-primary ml-10 space-y-5">

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question</p>
                    <div className="text-sm leading-relaxed bg-white border border-border rounded-lg p-3.5">{group.questionText}</div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Gold Answer</p>
                    <div className="text-sm leading-relaxed bg-green-50 border border-green-200 rounded-lg p-3.5 text-green-800">{group.goldAnswer}</div>
                  </div>

                  {group.modelResponses.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                        SLM Responses
                        <span className="ml-1.5 text-muted-foreground font-normal">({group.modelResponses.length} models)</span>
                      </p>
                      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0 flex-nowrap">
                        {group.modelResponses.map((mr, i) => (
                          <button key={mr.responseId}
                            onClick={(e) => { e.stopPropagation(); setActiveModelIdx(i); }}
                            className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                              activeModelIdx === i
                                ? "border-primary text-primary bg-primary/5"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                            }`}>
                            {mr.modelName}
                            {mr.score != null && (
                              <span className={`ml-1.5 font-bold ${mr.score >= 4 ? "text-green-600" : mr.score >= 3 ? "text-amber-600" : "text-red-500"}`}>
                                {mr.score}/5
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {group.modelResponses[activeModelIdx] && (() => {
                        const mr = group.modelResponses[activeModelIdx];
                        return (
                          <div className="space-y-3 pt-1">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Response</p>
                                <div className="flex items-center gap-2">
                                  {mr.inferenceTimeMs && <span className="text-xs text-muted-foreground font-mono">{mr.inferenceTimeMs}ms</span>}
                                  {mr.score != null && <ScoreBadge score={mr.score} />}
                                  {mr.judgeModelName && <Badge variant="secondary" className="text-xs">{mr.judgeModelName}</Badge>}
                                </div>
                              </div>
                              <div className="text-sm leading-relaxed bg-blue-50 border border-blue-200 rounded-lg p-3.5">{mr.responseText}</div>
                            </div>

                            {mr.mustHaveScore != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Must-Have Score:</span>
                                <span className="text-sm font-mono font-semibold">{Number(mr.mustHaveScore).toFixed(4)}</span>
                              </div>
                            )}

                            {mr.reasoning && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Judge Reasoning</p>
                                <div className="text-sm leading-relaxed bg-white border border-border rounded-lg p-3.5 max-h-[180px] overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                                  {mr.reasoning}
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2 flex-wrap pt-1">
                              {mr.evaluationId && canDelete(mr.evaluationCreatedBy) && (
                                <Button variant="outline" size="sm"
                                  className="gap-2 text-amber-700 border-amber-200 hover:bg-amber-50"
                                  onClick={(e) => { e.stopPropagation(); onClearEvaluation(mr.evaluationId!); }}>
                                  <RotateCcw className="h-3.5 w-3.5" />Clear evaluation
                                </Button>
                              )}
                              {canDelete(mr.responseCreatedBy) && (
                                <Button variant="outline" size="sm"
                                  className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={(e) => { e.stopPropagation(); onDeleteResponse(mr.responseId); }}>
                                  <Trash2 className="h-3.5 w-3.5" />Delete response
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {group.referenceAnswers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                        LLM Reference Answers
                        <span className="ml-1.5 text-amber-400 font-normal">({group.referenceAnswers.length})</span>
                      </p>
                      {group.referenceAnswers.map((ra, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3.5">
                          <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-800 mb-2">
                            {ra.judgeModelName}
                          </span>
                          <div className="text-sm leading-relaxed text-amber-900 mt-1.5">{ra.answerText}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}
