import { useListModels, useListDatasets, useRunJudge, getListEvaluationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Play, Settings, AlertCircle, CheckCircle2, SkipForward, BookOpen, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { motion } from "framer-motion";

interface JudgeModelConfig {
  judgeModelId: number | null;
  displayName: string | null;
  provider: string | null;
  modelVersion: string | null;
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

const PROVIDER_LABEL: Record<string, string> = {
  OpenAI: "OpenAI",
  Gemini: "Google",
  Claude: "Anthropic",
  DeepSeek: "DeepSeek",
};

function useJudgeModel() {
  return useQuery<JudgeModelConfig>({
    queryKey: ["settings", "judge-model"],
    queryFn: () => fetch("/api/settings/judge-model", { credentials: "include" }).then((r) => r.json()),
  });
}

function useRefStatus(datasetId: string | null) {
  return useQuery<RefStatus>({
    queryKey: ["reference-answers", "status", datasetId],
    queryFn: () =>
      fetch(`/api/reference-answers/status?datasetId=${datasetId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!datasetId,
    staleTime: 0,
  });
}

export default function Evaluate() {
  const { data: models, isLoading: isLoadingModels } = useListModels();
  const { data: datasets, isLoading: isLoadingDatasets } = useListDatasets();
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const runJudge = useRunJudge();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

  const { data: refStatus } = useRefStatus(selectedDatasetId || null);

  const refComplete = refStatus ? refStatus.covered >= refStatus.total && refStatus.total > 0 : false;
  const refProgress = refStatus && refStatus.total > 0
    ? Math.round((refStatus.covered / refStatus.total) * 100)
    : 0;

  const isReady = !!(judgeModel?.judgeModelId) && !!selectedDatasetId && refComplete;

  function handleEvaluate() {
    if (!judgeModel?.judgeModelId || !selectedDatasetId) return;
    setEvalResult(null);
    runJudge.mutate(
      {
        data: {
          judgeModelId: judgeModel.judgeModelId,
          datasetId: parseInt(selectedDatasetId),
          modelId: selectedModelId && selectedModelId !== "all" ? parseInt(selectedModelId) : undefined,
          useReferenceAnswers: true,
        },
      },
      {
        onSuccess: (res) => {
          setEvalResult(res);
          queryClient.invalidateQueries({ queryKey: getListEvaluationsQueryKey() });
          toast({ title: "Evaluation complete", description: `Evaluated ${res.evaluated} responses.` });
        },
        onError: (err) => {
          toast({ title: "Evaluation failed", description: (err as { error?: string }).error ?? "Unknown error", variant: "destructive" });
        },
      }
    );
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

          {/* Judge Model */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Judge Model</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingJudge ? (
                <Skeleton className="h-14 w-full" />
              ) : judgeModel?.judgeModelId ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="font-semibold text-green-800">{judgeModel.displayName}</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {PROVIDER_LABEL[judgeModel.provider ?? ""] ?? judgeModel.provider} · {judgeModel.modelVersion}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>
                    <Link href="/settings">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 text-sm">
                    No judge model configured.{" "}
                    <Link href="/settings" className="underline font-medium">Configure in Settings →</Link>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Dataset & Model selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Dataset & Model</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Dataset <span className="text-destructive">*</span>
                  </Label>
                  {isLoadingDatasets ? <Skeleton className="h-10 w-full" /> : (
                    <Select value={selectedDatasetId} onValueChange={(v) => {
                      setSelectedDatasetId(v);
                      setEvalResult(null);
                    }}>
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
            </CardContent>
          </Card>

          {/* Reference answers status */}
          {selectedDatasetId && (
            <Card className={`border-2 ${refComplete ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}`}>
              <CardContent className="p-4">
                {refStatus && refStatus.total > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {refComplete
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-amber-500" />
                        }
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

          {/* Run button */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Button
                className="w-full h-12 gap-2 text-base"
                onClick={handleEvaluate}
                disabled={runJudge.isPending || !judgeModel?.judgeModelId || !selectedDatasetId || !refComplete}
              >
                {runJudge.isPending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-r-transparent rounded-full animate-spin" />
                    Running evaluation…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Start Evaluation
                  </>
                )}
              </Button>

              {!isReady && (
                <p className="text-xs text-muted-foreground text-center">
                  {!judgeModel?.judgeModelId
                    ? "Configure a judge model in Settings"
                    : !selectedDatasetId
                    ? "Select a dataset to continue"
                    : "Complete Step 2 (Reference Answers) before evaluating"}
                </p>
              )}

              {/* Result */}
              {evalResult && (
                <div className="pt-2 space-y-3">
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
                    <Button className="w-full" variant="outline">
                      View Results →
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
            </CardHeader>
            <CardContent className="p-0">
              {[
                { score: 5, label: "Excellent", desc: "Matches or exceeds LLM reference", bg: "bg-green-50", text: "text-green-700", badge: "bg-green-100 text-green-700" },
                { score: 4, label: "Good", desc: "Clinically sound, minor omissions", bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
                { score: 3, label: "Partial", desc: "Acceptable but lacking precision", bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
                { score: 2, label: "Weak", desc: "Major clinical omission", bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
                { score: 1, label: "Critical", desc: "Hallucination or dangerous error", bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700" },
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
        </div>
      </div>
    </motion.div>
  );
}
