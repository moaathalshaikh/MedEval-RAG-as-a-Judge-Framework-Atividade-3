import { useListModels, useListDatasets, useGenerateResponses, getListResponsesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { PlaySquare, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function Inference() {
  const { data: models, isLoading: isLoadingModels } = useListModels();
  const { data: datasets, isLoading: isLoadingDatasets } = useListDatasets();
  const generateResponses = useGenerateResponses();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [result, setResult] = useState<{ generated: number; skipped: number; errors: string[] } | null>(null);

  function handleGenerate() {
    if (!selectedModelId || !selectedDatasetId) return;

    setResult(null);

    generateResponses.mutate(
      {
        data: {
          modelId: parseInt(selectedModelId),
          datasetId: parseInt(selectedDatasetId),
        },
      },
      {
        onSuccess: (res) => {
          setResult(res);
          queryClient.invalidateQueries({ queryKey: getListResponsesQueryKey() });
          toast({
            title: "Inference Complete",
            description: `Generated ${res.generated} responses.`,
          });
        },
        onError: (err) => {
          toast({
            title: "Inference Failed",
            description: err.error || "Unknown error occurred",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Inference Pipeline</h2>
        <p className="text-muted-foreground">Run models against datasets to generate responses for evaluation.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run Inference</CardTitle>
          <CardDescription>Select a model and a dataset to generate responses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Model</Label>
              {isLoadingModels ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model to run" />
                  </SelectTrigger>
                  <SelectContent>
                    {models?.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.modelName} ({m.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Dataset</Label>
              {isLoadingDatasets ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets?.map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.datasetName} ({d.questionCount} questions)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <Button
            className="w-full h-12 text-lg"
            onClick={handleGenerate}
            disabled={generateResponses.isPending || !selectedModelId || !selectedDatasetId}
          >
            <PlaySquare className="mr-2 h-5 w-5" />
            {generateResponses.isPending ? "Generating Responses..." : "Generate Responses"}
          </Button>

          {result && (
            <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-lg font-medium border-b border-border pb-2">Results</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-primary/10 border-primary/20">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
                    <div className="text-3xl font-bold">{result.generated}</div>
                    <div className="text-sm text-muted-foreground">Generated</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                    <div className="text-3xl font-bold">{result.skipped}</div>
                    <div className="text-sm text-muted-foreground">Skipped (Already exist)</div>
                  </CardContent>
                </Card>
              </div>

              {result.errors.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Errors Encountered</AlertTitle>
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
  );
}