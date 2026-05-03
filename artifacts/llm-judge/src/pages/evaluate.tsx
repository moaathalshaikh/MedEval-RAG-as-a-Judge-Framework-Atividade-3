import { useListModels, useListDatasets, useRunJudge, getListEvaluationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Play, Settings, AlertCircle, CheckCircle2, SkipForward } from "lucide-react";
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

const PROVIDER_LABEL: Record<string, string> = {
  OpenAI:   "OpenAI",
  Gemini:   "Google",
  Claude:   "Anthropic",
  DeepSeek: "DeepSeek",
};

function useJudgeModel() {
  return useQuery<JudgeModelConfig>({
    queryKey: ["settings", "judge-model"],
    queryFn: () => fetch("/api/settings/judge-model").then((r) => r.json()),
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
  const [result, setResult] = useState<{ evaluated: number; skipped: number; errors: string[] } | null>(null);

  function handleEvaluate() {
    if (!selectedDatasetId || !judgeModel?.judgeModelId) return;
    setResult(null);
    runJudge.mutate(
      {
        data: {
          judgeModelId: judgeModel.judgeModelId,
          datasetId: parseInt(selectedDatasetId),
          modelId: selectedModelId && selectedModelId !== "all" ? parseInt(selectedModelId) : undefined,
        },
      },
      {
        onSuccess: (res) => {
          setResult(res);
          queryClient.invalidateQueries({ queryKey: getListEvaluationsQueryKey() });
          toast({ title: "Evaluation complete", description: `Evaluated ${res.evaluated} responses.` });
        },
        onError: (err) => {
          toast({ title: "Evaluation failed", description: err.error || "Unknown error", variant: "destructive" });
        },
      }
    );
  }

  const isReady = !!(judgeModel?.judgeModelId) && !!selectedDatasetId;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Evaluate</h1>
        <p className="text-sm text-muted-foreground mt-1">Run the LLM-as-a-Judge pipeline on imported responses</p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8 space-y-4">
          {/* Judge Model Status */}
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

          {/* Parameters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Evaluation Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Dataset <span className="text-destructive">*</span>
                  </Label>
                  {isLoadingDatasets ? <Skeleton className="h-10 w-full" /> : (
                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
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

              <Button
                className="w-full h-11 gap-2"
                onClick={handleEvaluate}
                disabled={runJudge.isPending || !isReady}
              >
                {runJudge.isPending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-r-transparent rounded-full animate-spin" />
                    Running evaluation...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Start Evaluation
                  </>
                )}
              </Button>

              {!isReady && !runJudge.isPending && (
                <p className="text-xs text-muted-foreground text-center">
                  {!judgeModel?.judgeModelId ? "Configure a judge model to continue" : "Select a dataset to continue"}
                </p>
              )}

              {result && (
                <div className="pt-4 border-t border-border space-y-3">
                  <p className="text-sm font-semibold">Results</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-xl font-bold text-green-700">{result.evaluated}</p>
                        <p className="text-xs text-green-600">Evaluated</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                      <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xl font-bold text-foreground">{result.skipped}</p>
                        <p className="text-xs text-muted-foreground">Skipped</p>
                      </div>
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {result.errors.length} error(s) occurred during evaluation.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rubric */}
        <div className="md:col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Scoring Rubric</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {[
                { score: 5, label: "Excellent", desc: "Meets or exceeds ground truth", bg: "bg-green-50", text: "text-green-700", badge: "bg-green-100 text-green-700" },
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
