import React from "react";
import { useListDatasets } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, SkipForward, Sparkles, Settings, ArrowRight } from "lucide-react";
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

interface GenerateRefResult {
  generated: number;
  skipped: number;
  errors: string[];
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

function useGenerateRefAnswers() {
  return useMutation<GenerateRefResult, { error?: string }, { datasetId: number; judgeModelId: number }>({
    mutationFn: (body) =>
      fetch("/api/reference-answers/generate", {
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

export default function ReferenceAnswers() {
  const { data: datasets, isLoading: isLoadingDatasets } = useListDatasets();
  const { data: activeJudgeModels, isLoading: isLoadingJudge } = useActiveJudgeModels();
  const [selectedJudgeId, setSelectedJudgeId] = useSharedJudgeModelId();
  const generateRef = useGenerateRefAnswers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: selectedDatasetData } = useQuery<string>({
    queryKey: ["ui", "selectedDatasetId"],
    queryFn: () => "",
    staleTime: Infinity,
  });
  const selectedDatasetId = selectedDatasetData ?? "";
  function setSelectedDatasetId(id: string) {
    queryClient.setQueryData(["ui", "selectedDatasetId"], id);
  }

  const { data: refStatus, refetch: refetchStatus } = useRefStatus(
    selectedDatasetId || null,
    selectedJudgeId
  );

  // Animated local progress counter while generating
  const [localProgress, setLocalProgress] = React.useState(0);
  const totalQuestions = refStatus?.total ?? 0;

  React.useEffect(() => {
    if (!generateRef.isPending) {
      setLocalProgress(0);
      return;
    }
    setLocalProgress(0);
    // concurrency = 4, ~3 s per question → estimated total time
    const estimatedMs = Math.max(6000, (totalQuestions / 4) * 3000);
    const tickMs = 250;
    const increment = (tickMs / estimatedMs) * totalQuestions;
    const id = setInterval(() => {
      setLocalProgress((prev) => Math.min(prev + increment, totalQuestions * 0.95));
    }, tickMs);
    return () => clearInterval(id);
  }, [generateRef.isPending, totalQuestions]);

  const refComplete = refStatus ? refStatus.covered >= refStatus.total && refStatus.total > 0 : false;
  const refProgress = refStatus && refStatus.total > 0
    ? Math.round((refStatus.covered / refStatus.total) * 100)
    : 0;

  const selectedJudge = activeJudgeModels?.find((m) => m.id.toString() === selectedJudgeId);
  const judgeMeta = selectedJudge ? PROVIDER_META[selectedJudge.provider] : null;
  const hasActiveModels = (activeJudgeModels?.length ?? 0) > 0;
  const isReady = !!selectedJudge && !!selectedDatasetId;

  const { data: resultData } = useQuery<GenerateRefResult | null>({
    queryKey: ["ui", "refGenResult"],
    queryFn: () => null,
    staleTime: Infinity,
  });

  function handleGenerate() {
    if (!isReady || !selectedJudge) return;
    queryClient.setQueryData(["ui", "refGenResult"], null);
    generateRef.mutate(
      { datasetId: parseInt(selectedDatasetId), judgeModelId: selectedJudge.id },
      {
        onSuccess: (res) => {
          queryClient.setQueryData(["ui", "refGenResult"], res);
          refetchStatus();
          queryClient.invalidateQueries({ queryKey: ["reference-answers"] });
          toast({
            title: "Reference answers ready",
            description: `Generated ${res.generated} answers using ${selectedJudge.displayName}.`,
          });
        },
        onError: (err) => {
          toast({ title: "Generation failed", description: err.error ?? "Unknown error", variant: "destructive" });
        },
      }
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
          <h1 className="text-2xl font-bold text-foreground">Reference Answers</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Let the large judge model answer every question — these become the ground truth for evaluation.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8 space-y-4">

          {/* Judge model dropdown — same pattern as Evaluate page */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Judge Model (Large LLM)</CardTitle>
                <Link href="/settings">
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Settings className="h-3.5 w-3.5" />
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingJudge ? (
                <Skeleton className="h-10 w-full" />
              ) : !hasActiveModels ? (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 text-sm">
                    No active judge models.{" "}
                    <Link href="/settings" className="underline font-medium">
                      Configure a model in Settings →
                    </Link>
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

                  {/* Selected judge preview */}
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

          {/* Dataset selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Select Dataset</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Dataset <span className="text-destructive">*</span>
                </Label>
                {isLoadingDatasets ? <Skeleton className="h-10 w-full" /> : (
                  <Select value={selectedDatasetId} onValueChange={(v) => {
                    setSelectedDatasetId(v);
                    queryClient.setQueryData(["ui", "refGenResult"], null);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets?.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Progress & Generate */}
          <Card className={`border-2 ${isReady ? "border-blue-200" : "border-border"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Generate Answers</CardTitle>
              <p className="text-xs text-muted-foreground">
                The judge model will answer each question. Results are saved and reused automatically.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status bar — shows animated progress while generating, coverage otherwise */}
              {selectedDatasetId && selectedJudgeId && refStatus && refStatus.total > 0 && (
                generateRef.isPending ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Generating…</span>
                      <span className="font-medium text-blue-600">
                        ~{Math.min(Math.round(localProgress), refStatus.total)} / {refStatus.total} questions
                      </span>
                    </div>
                    <Progress
                      value={refStatus.total > 0 ? (localProgress / refStatus.total) * 100 : 0}
                      className="h-2"
                    />
                    <p className="text-xs text-blue-600 flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      Calling {selectedJudge?.displayName}{selectedJudge?.modelVersion ? ` · ${selectedJudge.modelVersion}` : ""}…
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Coverage</span>
                      <span className={`font-medium ${refComplete ? "text-green-600" : "text-foreground"}`}>
                        {refStatus.covered} / {refStatus.total} questions
                      </span>
                    </div>
                    <Progress value={refProgress} className="h-2" />
                    {refComplete && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> All questions covered — ready for evaluation
                      </p>
                    )}
                  </div>
                )
              )}

              <Button
                className="w-full h-11 gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={handleGenerate}
                disabled={generateRef.isPending || !isReady}
              >
                {generateRef.isPending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-r-transparent rounded-full animate-spin" />
                    Generating reference answers…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {refComplete ? "Re-generate Reference Answers" : "Generate Reference Answers"}
                  </>
                )}
              </Button>

              {!isReady && (
                <p className="text-xs text-muted-foreground text-center">
                  {!hasActiveModels
                    ? "Configure a judge model in Settings first"
                    : !selectedJudge
                    ? "Select a judge model above"
                    : "Select a dataset to continue"}
                </p>
              )}

              {/* Result summary */}
              {resultData && (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-3">
                    <div className="flex-1 flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-xl font-bold text-green-700">{resultData.generated}</p>
                        <p className="text-xs text-green-600">Generated</p>
                      </div>
                    </div>
                    {resultData.skipped > 0 && (
                      <div className="flex-1 flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                        <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-xl font-bold">{resultData.skipped}</p>
                          <p className="text-xs text-muted-foreground">Skipped</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {resultData.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {resultData.errors.slice(0, 3).join("; ")}
                        {resultData.errors.length > 3 && ` (+${resultData.errors.length - 3} more)`}
                      </AlertDescription>
                    </Alert>
                  )}
                  {refComplete && (
                    <Link href="/evaluate">
                      <Button className="w-full gap-2" variant="outline">
                        Continue to Evaluate
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel */}
        <div className="md:col-span-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">About This Step</p>
              <div className="space-y-2.5 text-xs text-blue-800">
                <div className="flex gap-2">
                  <span className="font-bold shrink-0 text-blue-600">Why?</span>
                  <span>Instead of comparing small models to curated gold answers, we use a large LLM's answers as the reference — more realistic and scalable.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold shrink-0 text-blue-600">MCQ</span>
                  <span>The judge selects the correct option letter (A, B, C…).</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold shrink-0 text-blue-600">Open</span>
                  <span>The judge writes a comprehensive clinical answer that serves as the ideal response.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold shrink-0 text-blue-600">Cached</span>
                  <span>Answers are stored per dataset + judge model. You only need to generate them once unless the model changes.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
