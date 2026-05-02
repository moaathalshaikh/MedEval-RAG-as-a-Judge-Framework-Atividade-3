import { useListModels, useListDatasets, useRunJudge, getListEvaluationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { FileCheck2, CheckSquare, AlertTriangle, Settings, ChevronRight, Play, Cpu, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { motion } from "framer-motion";

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
            title: "Pipeline Execution Complete",
            description: `Evaluated ${res.evaluated} responses against ground truth.`,
          });
        },
        onError: (err) => {
          toast({
            title: "Pipeline Fault",
            description: err.error || "Unknown execution error",
            variant: "destructive",
          });
        },
      }
    );
  }

  const isReady = !!(judgeModel?.modelId) && !!selectedDatasetId;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="border-b border-border pb-6">
        <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground flex items-center gap-3">
          <Play className="h-6 w-6 text-primary" />
          LLM-as-a-Judge Pipeline
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Execute Evaluation Workflow</p>
      </div>

      <div className="grid gap-8 md:grid-cols-12 align-top">
        <div className="md:col-span-8 space-y-8">
          <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm shadow-md">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> Selected Evaluator Config
                </div>
                {judgeModel?.modelId && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] text-primary font-bold">ACTIVE</span>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {isLoadingJudge ? (
                <Skeleton className="h-20 w-full rounded-none" />
              ) : judgeModel?.modelId ? (
                <div className="bg-background border border-border p-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{judgeModel.modelName}</h3>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-1">
                      {judgeModel.provider} | {judgeModel.version}
                    </div>
                  </div>
                  <Link href="/settings" className="text-muted-foreground hover:text-primary transition-colors">
                    <Settings className="h-5 w-5" />
                  </Link>
                </div>
              ) : (
                <Alert className="rounded-none border-destructive/30 bg-destructive/5 text-destructive">
                  <AlertCircle className="h-4 w-4 stroke-destructive" />
                  <AlertTitle className="font-mono text-xs uppercase tracking-widest">Configuration Required</AlertTitle>
                  <AlertDescription className="text-[10px] font-mono mt-2">
                    System requires a designated evaluator model before execution. 
                    <Link href="/settings" className="ml-2 inline-flex items-center underline underline-offset-2 hover:text-foreground">
                      Configure Settings <ChevronRight className="h-3 w-3 ml-1" />
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <FileCheck2 className="h-4 w-4" /> Pipeline Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground flex items-center justify-between">
                    <span>Target Corpus</span>
                    <span className="text-destructive">*</span>
                  </Label>
                  {isLoadingDatasets ? (
                    <Skeleton className="h-10 w-full rounded-none" />
                  ) : (
                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                      <SelectTrigger className="rounded-none bg-background/50 font-mono text-sm h-10">
                        <SelectValue placeholder="Select dataset" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none font-mono text-sm">
                        {datasets?.map((d) => (
                          <SelectItem key={d.id} value={d.id.toString()}>
                            {d.datasetName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
                    Model Filter (Optional)
                  </Label>
                  {isLoadingModels ? (
                    <Skeleton className="h-10 w-full rounded-none" />
                  ) : (
                    <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                      <SelectTrigger className="rounded-none bg-background/50 font-mono text-sm h-10">
                        <SelectValue placeholder="ALL SUBJECTS" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none font-mono text-sm">
                        <SelectItem value="all">-- ALL SUBJECTS --</SelectItem>
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

              <div className="pt-4 border-t border-border/50">
                <Button
                  className="w-full rounded-none font-mono tracking-widest uppercase text-sm h-14 bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 group"
                  onClick={handleEvaluate}
                  disabled={runJudge.isPending || !isReady}
                >
                  {runJudge.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-primary-foreground border-r-transparent rounded-full animate-spin" />
                      Executing Pipeline...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play className="h-5 w-5 fill-current" />
                      Initiate Evaluation
                    </span>
                  )}
                </Button>
              </div>

              {result && (
                <div className="mt-8 pt-6 border-t border-border/50 animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Execution Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="rounded-none bg-primary/5 border-primary/30">
                      <CardContent className="p-4 flex flex-col items-center">
                        <CheckSquare className="h-6 w-6 text-primary mb-2 opacity-80" />
                        <div className="text-3xl font-light font-mono text-primary">{result.evaluated}</div>
                        <div className="text-[10px] font-mono tracking-widest uppercase text-primary/70 mt-1">Evaluated</div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-none bg-muted/20 border-border">
                      <CardContent className="p-4 flex flex-col items-center">
                        <AlertTriangle className="h-6 w-6 text-muted-foreground mb-2 opacity-50" />
                        <div className="text-3xl font-light font-mono text-muted-foreground">{result.skipped}</div>
                        <div className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground/70 mt-1">Skipped</div>
                      </CardContent>
                    </Card>
                  </div>
                  {result.errors.length > 0 && (
                    <Alert variant="destructive" className="mt-4 rounded-none border-destructive/30 bg-destructive/10">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="font-mono text-xs uppercase tracking-widest">Execution Faults</AlertTitle>
                      <AlertDescription>
                        <ul className="list-none mt-2 max-h-32 overflow-y-auto space-y-1">
                          {result.errors.map((err, i) => (
                            <li key={i} className="text-[10px] font-mono text-destructive/90 break-all">{err}</li>
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

        <div className="md:col-span-4 space-y-6">
          <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Evaluation Criteria
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0 pb-0">
              <div className="flex flex-col divide-y divide-border/30">
                {[
                  { score: 5, label: "EXCELLENT", color: "bg-green-500/10 text-green-500", desc: "Meets or exceeds ground truth standards." },
                  { score: 4, label: "GOOD", color: "bg-cyan-500/10 text-cyan-500", desc: "Clinically sound, minor omissions." },
                  { score: 3, label: "PARTIAL", color: "bg-yellow-500/10 text-yellow-500", desc: "Acceptable context, lacking precision." },
                  { score: 2, label: "WEAK", color: "bg-orange-500/10 text-orange-500", desc: "Major clinical omission or flawed reasoning." },
                  { score: 1, label: "CRITICAL", color: "bg-destructive/10 text-destructive", desc: "Hallucination or dangerous inaccuracy." },
                ].map(({ score, label, color, desc }) => (
                  <div key={score} className="p-4 flex flex-col gap-2 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`rounded-none font-mono text-xs border border-current ${color}`}>
                        {score}.0
                      </Badge>
                      <span className="font-mono text-xs font-bold tracking-widest uppercase">{label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-12 leading-relaxed opacity-80">{desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}