import { useListModels, useListDatasets, useRunJudge, getListEvaluationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { FileCheck2, CheckCircle2, AlertCircle, Gavel, Settings } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface JudgeModelStatus {
  modelId: number | null;
  modelName: string | null;
  provider: string | null;
  version: string | null;
}

function useJudgeModel() {
  return useQuery<JudgeModelStatus>({
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
    if (!selectedDatasetId || !judgeModel?.modelId) return;

    setResult(null);

    runJudge.mutate(
      {
        data: {
          judgeModelId: judgeModel.modelId,
          datasetId: parseInt(selectedDatasetId),
          modelId: selectedModelId && selectedModelId !== "all" ? parseInt(selectedModelId) : undefined,
        },
      },
      {
        onSuccess: (res) => {
          setResult(res);
          queryClient.invalidateQueries({ queryKey: getListEvaluationsQueryKey() });
          toast({
            title: "Evaluation Complete",
            description: `Evaluated ${res.evaluated} responses using ${judgeModel.modelName}.`,
          });
        },
        onError: (err) => {
          toast({
            title: "Evaluation Failed",
            description: err.error || "Unknown error occurred",
            variant: "destructive",
          });
        },
      }
    );
  }

  const isReady = !!(judgeModel?.modelId) && !!selectedDatasetId;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">LLM-as-a-Judge</h2>
        <p className="text-muted-foreground">
          Run the configured judge model to evaluate imported SLM responses.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-primary" />
                Active Judge Model
              </CardTitle>
              <CardDescription>
                The judge model is configured in Settings. Only one judge is active at a time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingJudge ? (
                <Skeleton className="h-16 w-full" />
              ) : judgeModel?.modelId ? (
                <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
                  <div>
                    <div className="font-semibold">{judgeModel.modelName}</div>
                    <div className="text-sm text-muted-foreground font-mono">{judgeModel.version} · {judgeModel.provider}</div>
                  </div>
                  <Badge className="bg-primary text-primary-foreground">Active Judge</Badge>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No Judge Configured</AlertTitle>
                  <AlertDescription className="flex items-center gap-2 mt-1">
                    Go to Settings to designate a judge model.
                    <Link href="/settings">
                      <Button variant="outline" size="sm">
                        <Settings className="mr-1 h-3 w-3" /> Settings
                      </Button>
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run Evaluation</CardTitle>
              <CardDescription>Select which responses to evaluate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dataset <span className="text-destructive">*</span></Label>
                  {isLoadingDatasets ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select dataset" />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets?.map((d) => (
                          <SelectItem key={d.id} value={d.id.toString()}>
                            {d.datasetName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Filter by SLM (optional)</Label>
                  {isLoadingModels ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                      <SelectTrigger>
                        <SelectValue placeholder="All SLMs" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All SLMs</SelectItem>
                        {models?.map((m) => (
                          <SelectItem key={m.id} value={m.id.toString()}>
                            {m.modelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <Button
                className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleEvaluate}
                disabled={runJudge.isPending || !isReady}
              >
                <FileCheck2 className="mr-2 h-5 w-5" />
                {runJudge.isPending ? "Running Judge..." : "Run Judge"}
              </Button>

              {!judgeModel?.modelId && !isLoadingJudge && (
                <p className="text-xs text-muted-foreground text-center">
                  Configure a judge model in Settings first.
                </p>
              )}

              {result && (
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-lg font-medium border-b border-border pb-2">Results</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-primary/10 border-primary/20">
                      <CardContent className="p-4 flex flex-col items-center">
                        <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
                        <div className="text-3xl font-bold">{result.evaluated}</div>
                        <div className="text-sm text-muted-foreground">Evaluated</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/50">
                      <CardContent className="p-4 flex flex-col items-center">
                        <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                        <div className="text-3xl font-bold">{result.skipped}</div>
                        <div className="text-sm text-muted-foreground">Skipped</div>
                      </CardContent>
                    </Card>
                  </div>
                  {result.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Errors</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-4 mt-2 max-h-40 overflow-y-auto">
                          {result.errors.map((err, i) => (
                            <li key={i} className="text-xs font-mono">{err}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Scoring Rubric</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { score: 1, label: "Critical Error", color: "bg-red-500 hover:bg-red-600", desc: "Hallucination, factual error, or completely missed instruction." },
              { score: 2, label: "Weak", color: "bg-orange-500 hover:bg-orange-600", desc: "Major omissions or poor reasoning structure." },
              { score: 3, label: "Partial", color: "bg-yellow-500 hover:bg-yellow-600", desc: "Acceptable but unrefined, missing key nuance." },
              { score: 4, label: "Good", color: "bg-cyan-500 hover:bg-cyan-600", desc: "Strong response, minor detail issues." },
              { score: 5, label: "Excellent", color: "bg-green-500 hover:bg-green-600", desc: "Matches or exceeds gold standard." },
            ].map(({ score, label, color, desc }) => (
              <div key={score} className="flex items-start gap-3 text-sm">
                <Badge className={`${color} mt-0.5 shrink-0`}>{score}</Badge>
                <div>
                  <span className="font-semibold block">{label}</span>
                  <span className="text-muted-foreground text-xs">{desc}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
