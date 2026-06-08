import { useListModels, useListDatasets, getListEvaluationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Play, Settings, AlertCircle, CheckCircle2, SkipForward, BookOpen, Sparkles, FileText, ArrowRight, Calculator, ListFilter } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useSharedJudgeModelId } from "@/hooks/use-shared-judge";

interface ActiveJudgeModel {
  id: number;
  provider: string;
  displayName: string;
  modelVersion: string;
  hasKey: boolean;
  active: boolean;
}

interface RefStatus {
  total: number;
  covered: number;
  judgeModelId: number | null;
}

interface EvalResult {
  evaluated: number;
  skipped: number;
  errors: string[];
}

interface PromptItem {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
  ownerName: string;
}

const PROVIDER_META: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  OpenAI:   { label: "OpenAI",    bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  Gemini:   { label: "Google",    bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500"    },
  Claude:   { label: "Anthropic", bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500"   },
  DeepSeek: { label: "DeepSeek",  bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-500"  },
};

function useActiveJudgeModels() {
  return useQuery<ActiveJudgeModel[]>({
    queryKey: ["settings", "active-judge-models"],
    queryFn: () =>
      fetch("/api/settings/active-judge-models", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });
}

function useRefStatus(datasetId: string | null, judgeModelId: string) {
  return useQuery<RefStatus>({
    queryKey: ["reference-answers", "status", datasetId, judgeModelId],
    queryFn: () => {
      const params = new URLSearchParams({ datasetId: datasetId! });
      if (judgeModelId) params.set("judgeModelId", judgeModelId);
      return fetch(`/api/reference-answers/status?${params}`, { credentials: "include" }).then((r) => r.json());
    },
    enabled: !!datasetId,
    staleTime: 0,
  });
}

function useDatasetQuestionTypes(datasetId: string) {
  return useQuery<{ hasOpenEnded: boolean; hasMCQ: boolean; total: number }>({
    queryKey: ["questions", "types", datasetId],
    queryFn: () =>
      fetch(`/api/questions?datasetId=${datasetId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((qs: { questionType: string }[]) => ({
          hasOpenEnded: qs.some((q) => q.questionType === "OPEN_ENDED"),
          hasMCQ: qs.some((q) => q.questionType === "MCQ"),
          total: qs.length,
        })),
    enabled: !!datasetId,
    staleTime: 60_000,
  });
}

interface PendingCount { total: number; alreadyEvaluated: number; pending: number; }

function usePendingCount(datasetId: string, judgeModelId: string, modelId: string, ragFilter: string) {
  return useQuery<PendingCount>({
    queryKey: ["evaluations", "pending-count", datasetId, judgeModelId, modelId, ragFilter],
    queryFn: () => {
      const p = new URLSearchParams({ datasetId });
      if (judgeModelId) p.set("judgeModelId", judgeModelId);
      if (modelId && modelId !== "all") p.set("modelId", modelId);
      if (ragFilter !== "all") p.set("ragFilter", ragFilter);
      return fetch(`/api/evaluations/pending-count?${p}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!datasetId,
    staleTime: 0,
  });
}

function useDatasetQuestions(datasetId: string) {
  return useQuery<{ id: number; questionType: string }[]>({
    queryKey: ["questions", "list", datasetId],
    queryFn: () =>
      fetch(`/api/questions?datasetId=${datasetId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!datasetId,
    staleTime: 60_000,
  });
}

function useEvalPrompts() {
  return useQuery<PromptItem[]>({
    queryKey: ["prompts", "EVALUATION"],
    queryFn: () =>
      fetch("/api/prompts?type=EVALUATION", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });
}

function useRunJudgeCustom() {
  return useMutation<
    EvalResult,
    { error?: string },
    {
      judgeModelId: number;
      datasetId?: number;
      modelId?: number;
      useReferenceAnswers: boolean;
      evalPromptId?: string;
      questionIds?: number[];
      ragFilter?: "all" | "baseline" | "rag";
    }
  >({
    mutationFn: (body) =>
      fetch("/api/evaluations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(async (r) => {
        if (!r.ok) throw await r.json();
        return r.json();
      }),
  });
}

export default function Evaluate() {
  const { data: models, isLoading: isLoadingModels } = useListModels();
  const { data: datasets, isLoading: isLoadingDatasets } = useListDatasets();
  const { data: activeJudgeModels, isLoading: isLoadingJudge } = useActiveJudgeModels();
  const { data: evalPrompts } = useEvalPrompts();
  const runJudge = useRunJudgeCustom();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedJudgeId, setSelectedJudgeId] = useSharedJudgeModelId();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [evalPromptId, setEvalPromptId] = useState<string>("system_evaluation");
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [localProgress, setLocalProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Question range state
  const [ragFilter, setRagFilter] = useState<"all" | "baseline" | "rag">("all");
  const [rangeMode, setRangeMode] = useState(false);
  const [fromQ, setFromQ] = useState(1);
  const [toQRaw, setToQRaw] = useState<number | null>(null);

  // Reset range when dataset changes
  useEffect(() => {
    setRangeMode(false);
    setFromQ(1);
    setToQRaw(null);
  }, [selectedDatasetId]);

  const { data: refStatus } = useRefStatus(selectedDatasetId || null, selectedJudgeId);
  const { data: questionTypes } = useDatasetQuestionTypes(selectedDatasetId);
  const { data: allQuestions } = useDatasetQuestions(selectedDatasetId);
  const { data: pendingCount } = usePendingCount(selectedDatasetId, selectedJudgeId, selectedModelId, ragFilter);

  // Range derived values
  const totalQs = allQuestions?.length ?? questionTypes?.total ?? 0;
  const effectiveFrom = Math.max(1, Math.min(fromQ, Math.max(1, totalQs)));
  const effectiveTo = toQRaw !== null
    ? Math.max(effectiveFrom, Math.min(toQRaw, totalQs))
    : totalQs;
  const selectedCount = rangeMode && totalQs > 0 ? effectiveTo - effectiveFrom + 1 : totalQs;
  const slicedQuestionIds = rangeMode && allQuestions && allQuestions.length > 0
    ? allQuestions.slice(effectiveFrom - 1, effectiveTo).map((q) => q.id)
    : undefined;

  // Animated progress + elapsed timer while evaluation is running
  const totalForProgress = selectedCount > 0 ? selectedCount : (questionTypes?.total ?? refStatus?.total ?? 0);
  useEffect(() => {
    if (!runJudge.isPending) {
      setLocalProgress(0);
      setElapsedSec(0);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      return;
    }
    setLocalProgress(0);
    setElapsedSec(0);
    // Estimate duration: MCQ is fast (~80ms/q), open-ended needs LLM (~3s/q)
    const perQ = isMCQOnly ? 80 : 3000;
    const estimatedMs = Math.max(2000, totalForProgress * perQ);
    const tickMs = 300;
    const increment = (tickMs / estimatedMs) * totalForProgress;
    const id = setInterval(() => {
      setLocalProgress((p) => Math.min(p + increment, totalForProgress * 0.95));
      setElapsedSec((s) => s + tickMs / 1000);
    }, tickMs);
    elapsedRef.current = id;
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runJudge.isPending]);

  const isMCQOnly  = !!questionTypes && questionTypes.total > 0 && !questionTypes.hasOpenEnded;
  const isMixedOrOpen = !isMCQOnly;

  const refComplete = isMCQOnly
    ? true
    : refStatus ? refStatus.covered >= refStatus.total && refStatus.total > 0 : false;
  const refProgress = refStatus && refStatus.total > 0
    ? Math.round((refStatus.covered / refStatus.total) * 100)
    : 0;

  const selectedJudge = activeJudgeModels?.find((m) => m.id.toString() === selectedJudgeId);
  const firstAvailableJudge = activeJudgeModels?.[0];
  const judgeMeta = selectedJudge ? PROVIDER_META[selectedJudge.provider] : null;

  const hasActiveModels = (activeJudgeModels?.length ?? 0) > 0;
  const isReady = isMCQOnly
    ? !!selectedDatasetId
    : !!selectedJudge && !!selectedDatasetId && refComplete;

  const effectiveJudgeId = isMCQOnly
    ? (selectedJudge?.id ?? firstAvailableJudge?.id ?? 0)
    : selectedJudge?.id ?? 0;

  function handleEvaluate() {
    if (!selectedDatasetId) return;
    if (!isMCQOnly && !selectedJudge) return;
    setEvalResult(null);
    runJudge.mutate(
      {
        judgeModelId: effectiveJudgeId,
        datasetId: parseInt(selectedDatasetId),
        modelId: selectedModelId && selectedModelId !== "all" ? parseInt(selectedModelId) : undefined,
        useReferenceAnswers: isMixedOrOpen,
        evalPromptId: evalPromptId || "system_evaluation",
        questionIds: slicedQuestionIds,
        ragFilter,
      },
      {
        onSuccess: (res) => {
          setEvalResult(res);
          queryClient.invalidateQueries({ queryKey: getListEvaluationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["results"] });
          queryClient.invalidateQueries({ queryKey: ["evaluations", "pending-count"] });
          if (res.evaluated === 0 && res.skipped > 0) {
            toast({
              title: "Nothing new to evaluate",
              description: `All ${res.skipped} responses were already evaluated by this judge. No duplicates created.`,
            });
          } else if (res.evaluated === 0 && res.skipped === 0) {
            toast({
              title: "No responses found",
              description: ragFilter === "rag"
                ? "No RAG responses found for this dataset. Run RAG Re-Inference first."
                : "No responses match the current filter.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Evaluation complete", description: `Evaluated ${res.evaluated} responses${res.skipped > 0 ? ` · ${res.skipped} skipped (already done)` : ""}.` });
          }
        },
        onError: (err) => {
          toast({ title: "Evaluation failed", description: err.error ?? "Unknown error", variant: "destructive" });
        },
      }
    );
  }

  function promptLabel(p: PromptItem) {
    return p.isSystem ? "System Default" : `${p.name} (${p.ownerName})`;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
          <h1 className="text-2xl font-bold text-foreground">Evaluate</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Score each small model's responses by comparing them against the LLM reference answers.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8 space-y-4">

          {/* Judge Model selection */}
          <Card className={isMCQOnly ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">Judge Model</CardTitle>
                  {isMCQOnly && (
                    <Badge className="text-[10px] h-5 px-1.5 bg-blue-100 text-blue-700 border-blue-200 gap-1">
                      <Calculator className="h-3 w-3" />
                      Not required for MCQ
                    </Badge>
                  )}
                </div>
                {!isMCQOnly && (
                  <Link href="/settings">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Settings className="h-3.5 w-3.5" />
                      Manage
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isMCQOnly ? (
                <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-blue-50 border border-blue-200">
                  <Calculator className="h-5 w-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Auto-graded deterministically</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      MCQ scoring compares the model's letter directly to the gold answer — no LLM call is made.
                    </p>
                  </div>
                </div>
              ) : isLoadingJudge ? (
                <Skeleton className="h-10 w-full" />
              ) : !hasActiveModels ? (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 text-sm">
                    No active judge models.{" "}
                    <Link href="/settings" className="underline font-medium">Configure a model in Settings →</Link>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Select judge model</Label>
                    <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="— choose a configured judge model —" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeJudgeModels?.map((m) => {
                          const meta = PROVIDER_META[m.provider];
                          return (
                            <SelectItem key={m.id} value={m.id.toString()}>
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${meta?.dot ?? "bg-muted"}`} />
                                <span className="font-medium">{meta?.label ?? m.provider}</span>
                                <span className="text-muted-foreground font-mono text-xs">·  {m.modelVersion}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedJudge && judgeMeta && (
                    <motion.div
                      key={selectedJudgeId}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${judgeMeta.bg} ${judgeMeta.border}`}
                    >
                      <div>
                        <p className={`text-sm font-semibold ${judgeMeta.text}`}>{selectedJudge.displayName}</p>
                        <p className={`text-xs opacity-70 mt-0.5 ${judgeMeta.text}`}>
                          {judgeMeta.label} · {selectedJudge.modelVersion}
                        </p>
                      </div>
                      <Badge className={`text-xs border-0 ${judgeMeta.bg} ${judgeMeta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${judgeMeta.dot}`} />
                        Active
                      </Badge>
                    </motion.div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Evaluation Prompt */}
          <Card className={isMCQOnly ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Evaluation Prompt
                  </CardTitle>
                  {isMCQOnly && (
                    <Badge className="text-[10px] h-5 px-1.5 bg-blue-100 text-blue-700 border-blue-200 gap-1">
                      <Calculator className="h-3 w-3" />
                      Not required for MCQ
                    </Badge>
                  )}
                </div>
                {!isMCQOnly && (
                  <Link href="/settings?tab=prompts">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Settings className="h-3.5 w-3.5" />
                      Manage Prompts
                    </Button>
                  </Link>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isMCQOnly
                  ? "No prompt needed — MCQ is graded by direct letter comparison."
                  : "The prompt used to instruct the judge how to score each open-ended response. MCQ is graded deterministically."}
              </p>
            </CardHeader>
            {!isMCQOnly && (
              <CardContent>
                <Select value={evalPromptId} onValueChange={setEvalPromptId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(evalPrompts ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          {p.isSystem && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">System</span>
                          )}
                          <span>{promptLabel(p)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            )}
          </Card>

          {/* Dataset & Model selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Dataset & Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Dataset <span className="text-destructive">*</span>
                  </Label>
                  {isLoadingDatasets ? <Skeleton className="h-10 w-full" /> : (
                    <Select value={selectedDatasetId} onValueChange={(v) => { setSelectedDatasetId(v); setEvalResult(null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select dataset" />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets?.map((d) => (
                          <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Filter by Model <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  {isLoadingModels ? <Skeleton className="h-10 w-full" /> : (
                    <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                      <SelectTrigger>
                        <SelectValue placeholder="All models" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All models</SelectItem>
                        {models?.map((m) => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.modelName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* RAG Filter */}
              <div className="pt-1 border-t border-border space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Play className="h-3.5 w-3.5" />
                  Response Type to Evaluate
                </div>
                <div className="flex gap-1">
                  {(["all", "baseline", "rag"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setRagFilter(opt)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        ragFilter === opt
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {opt === "all" ? "All responses" : opt === "baseline" ? "Baseline only (no RAG)" : "RAG only"}
                    </button>
                  ))}
                </div>
                {ragFilter === "rag" && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Evaluates only RAG-augmented responses. Run Baseline first, then RAG, to enable the before/after comparison in Analytics.
                  </p>
                )}
                {ragFilter === "baseline" && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    Evaluates only baseline responses (rag_enabled = false). Skips any RAG-augmented responses.
                  </p>
                )}
              </div>

              {/* Question Range */}
              {selectedDatasetId && totalQs > 0 && (
                <div className="space-y-2.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ListFilter className="h-3.5 w-3.5" />
                      Question Range
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setRangeMode(false)}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${!rangeMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/60"}`}
                      >
                        All {totalQs}
                      </button>
                      <button
                        onClick={() => { setRangeMode(true); if (toQRaw === null) setToQRaw(totalQs); }}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${rangeMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/60"}`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  {rangeMode && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Label className="text-xs text-muted-foreground shrink-0 w-7">From</Label>
                        <Input
                          type="number"
                          min={1}
                          max={totalQs}
                          value={effectiveFrom}
                          onChange={(e) => setFromQ(Math.max(1, parseInt(e.target.value) || 1))}
                          className="h-8 text-sm text-center"
                        />
                      </div>
                      <span className="text-muted-foreground text-xs">–</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <Label className="text-xs text-muted-foreground shrink-0 w-3">To</Label>
                        <Input
                          type="number"
                          min={effectiveFrom}
                          max={totalQs}
                          value={effectiveTo}
                          onChange={(e) => setToQRaw(Math.max(effectiveFrom, Math.min(parseInt(e.target.value) || totalQs, totalQs)))}
                          className="h-8 text-sm text-center"
                        />
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 tabular-nums">
                        {selectedCount} q
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reference answers status — hidden for MCQ-only datasets */}
          {selectedDatasetId && !isMCQOnly && (
            <Card className={`border-2 ${refComplete ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}`}>
              <CardContent className="p-4">
                {refStatus && refStatus.total > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {refComplete
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-amber-500" />}
                        <span className="text-sm font-medium">
                          {refComplete ? "Reference answers ready" : "Reference answers incomplete"}
                        </span>
                      </div>
                      <span className={`text-xs font-medium ${refComplete ? "text-green-600" : "text-amber-600"}`}>
                        {refStatus.covered} / {refStatus.total}
                      </span>
                    </div>
                    <Progress value={refProgress} className="h-1.5" />
                    {!refComplete && (
                      <Link href="/reference-answers">
                        <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate Reference Answers first
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium text-amber-700">No reference answers yet for this dataset</span>
                    </div>
                    <Link href="/reference-answers">
                      <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                        <Sparkles className="h-3.5 w-3.5" />
                        Go to Step 2
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Run button + live progress */}
          <Card className={`border-2 transition-colors ${isReady ? "border-primary/30" : "border-border"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Run Evaluation</CardTitle>
              <p className="text-xs text-muted-foreground">
                {isMCQOnly
                  ? "MCQ responses are graded instantly by direct letter comparison."
                  : "Each open-ended response is sent to the judge LLM along with the reference answer."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Live progress — shown only while running */}
              {runJudge.isPending && totalForProgress > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                      Evaluating…
                    </span>
                    <span className="font-medium text-primary tabular-nums">
                      ~{Math.min(Math.round(localProgress), totalForProgress)} / {totalForProgress} questions
                    </span>
                  </div>
                  <Progress
                    value={totalForProgress > 0 ? (localProgress / totalForProgress) * 100 : 0}
                    className="h-2"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {isMCQOnly
                        ? <><Calculator className="h-3 w-3" /> Auto-grading…</>
                        : <><span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Calling {selectedJudge?.displayName ?? "judge model"}…</>
                      }
                    </span>
                    <span className="font-mono">
                      {Math.floor(elapsedSec / 60) > 0
                        ? `${Math.floor(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`
                        : `${Math.round(elapsedSec)}s`}
                    </span>
                  </div>
                </div>
              )}

              {/* Pending count summary */}
              {selectedDatasetId && pendingCount && !runJudge.isPending && (
                <div className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between border ${
                  pendingCount.pending === 0
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-muted/40 border-border text-muted-foreground"
                }`}>
                  <span>
                    {pendingCount.pending === 0
                      ? "⚠ All responses already evaluated — nothing new to run"
                      : <>
                          <span className="font-semibold text-foreground">{pendingCount.pending}</span> pending
                          {pendingCount.alreadyEvaluated > 0 && (
                            <> · <span className="line-through">{pendingCount.alreadyEvaluated}</span> already done (will skip)</>
                          )}
                        </>
                    }
                  </span>
                  {ragFilter === "rag" && pendingCount.total === 0 && (
                    <span className="font-medium text-amber-700">Run RAG Re-Inference first</span>
                  )}
                </div>
              )}

              <Button
                className="w-full h-12 gap-2 text-base"
                onClick={handleEvaluate}
                disabled={runJudge.isPending || !isReady || pendingCount?.pending === 0}
              >
                {runJudge.isPending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-r-transparent rounded-full animate-spin" />
                    Running evaluation…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    {pendingCount && pendingCount.pending > 0
                      ? `Start Evaluation (${pendingCount.pending} responses)`
                      : "Start Evaluation"}
                  </>
                )}
              </Button>

              {!isReady && !runJudge.isPending && (
                <p className="text-xs text-muted-foreground text-center">
                  {!selectedDatasetId
                    ? "Select a dataset to continue"
                    : isMCQOnly
                    ? ""
                    : !hasActiveModels
                    ? "Configure a judge model in Settings first"
                    : !selectedJudge
                    ? "Select a judge model above"
                    : "Complete Step 2 (Reference Answers) before evaluating"}
                </p>
              )}

              {/* Result summary */}
              {evalResult && (
                <div className="pt-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-xl font-bold text-green-700">{evalResult.evaluated}</p>
                        <p className="text-xs text-green-600">Evaluated</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                      <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xl font-bold text-foreground">{evalResult.skipped}</p>
                        <p className="text-xs text-muted-foreground">Skipped</p>
                      </div>
                    </div>
                  </div>
                  {evalResult.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {evalResult.errors.slice(0, 3).join("; ")}
                        {evalResult.errors.length > 3 && ` (+${evalResult.errors.length - 3} more)`}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Link href="/results">
                    <Button className="w-full gap-2" variant="outline">
                      View Results <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rubric */}
        <div className="md:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Scoring Rubric</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Applied to open-ended responses. MCQ is graded automatically.</p>
            </CardHeader>
            <CardContent className="p-0">
              {[
                { score: 5, label: "Excellent",  desc: "Matches or exceeds LLM reference",        bg: "bg-green-50",  text: "text-green-700",  badge: "bg-green-100 text-green-700"  },
                { score: 4, label: "Good",        desc: "Clinically sound, minor omissions",       bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700"    },
                { score: 3, label: "Partial",     desc: "Acceptable but lacking precision",        bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700"  },
                { score: 2, label: "Weak",        desc: "Major clinical omission",                 bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
                { score: 1, label: "Critical",    desc: "Hallucination or dangerous error",        bg: "bg-red-50",    text: "text-red-700",    badge: "bg-red-100 text-red-700"      },
              ].map(({ score, label, desc, bg, text, badge }) => (
                <div key={score} className={`flex items-start gap-3 p-3 border-b border-border last:border-0 ${bg}`}>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${badge}`}>{score}</span>
                  <div>
                    <p className={`text-sm font-semibold ${text}`}>{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4 space-y-2.5 text-xs text-slate-700">
              <p className="font-semibold text-slate-800">How it works</p>
              <div className="flex gap-2">
                <span className="font-bold shrink-0 text-slate-600">MCQ</span>
                <span>Graded automatically — model's letter vs. gold answer. No API call needed.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold shrink-0 text-slate-600">Open</span>
                <span>The judge LLM receives the question, LLM reference answer, and model response — then outputs a score 1–5 with reasoning.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold shrink-0 text-slate-600">Prompt</span>
                <span>Customize the evaluation criteria, rigor level, and rubric wording via the Evaluation Prompt selector above.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
