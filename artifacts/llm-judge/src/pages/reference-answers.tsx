import { useListDatasets } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, SkipForward, Sparkles, Settings, ArrowRight } from "lucide-react";
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

interface GenerateRefResult {
  generated: number;
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

function useGenerateRefAnswers() {
  return useMutation<GenerateRefResult, { error?: string }, { datasetId: number }>({
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
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const generateRef = useGenerateRefAnswers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [result, setResult] = useState<GenerateRefResult | null>(null);

  const { data: refStatus, refetch: refetchStatus } = useRefStatus(selectedDatasetId || null);

  const refComplete = refStatus ? refStatus.covered >= refStatus.total && refStatus.total > 0 : false;
  const refProgress = refStatus && refStatus.total > 0
    ? Math.round((refStatus.covered / refStatus.total) * 100)
    : 0;

  const isReady = !!(judgeModel?.judgeModelId) && !!selectedDatasetId;

  function handleGenerate() {
    if (!isReady) return;
    setResult(null);
    generateRef.mutate(
      { datasetId: parseInt(selectedDatasetId) },
      {
        onSuccess: (res) => {
          setResult(res);
          refetchStatus();
          queryClient.invalidateQueries({ queryKey: ["reference-answers"] });
          toast({
            title: "Reference answers ready",
            description: `Generated ${res.generated} answers using ${judgeModel?.displayName}.`,
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

          {/* Judge model status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Judge Model (Large LLM)</CardTitle>
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
                    setResult(null);
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
              {/* Status bar */}
              {selectedDatasetId && refStatus && refStatus.total > 0 && (
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
                  {!judgeModel?.judgeModelId ? "Configure a judge model first" : "Select a dataset to continue"}
                </p>
              )}

              {/* Result summary */}
              {result && (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-3">
                    <div className="flex-1 flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-xl font-bold text-green-700">{result.generated}</p>
                        <p className="text-xs text-green-600">Generated</p>
                      </div>
                    </div>
                    {result.skipped > 0 && (
                      <div className="flex-1 flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                        <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-xl font-bold">{result.skipped}</p>
                          <p className="text-xs text-muted-foreground">Skipped</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {result.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {result.errors.slice(0, 3).join("; ")}
                        {result.errors.length > 3 && ` (+${result.errors.length - 3} more)`}
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
