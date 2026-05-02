import { useGetResults, useListModels, useListDatasets, getGetResultsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function Results() {
  const [datasetId, setDatasetId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");

  const { data: models } = useListModels();
  const { data: datasets } = useListDatasets();

  const queryParams = {
    datasetId: datasetId !== "all" && datasetId !== "" ? parseInt(datasetId) : undefined,
    modelId: modelId !== "all" && modelId !== "" ? parseInt(modelId) : undefined,
  };

  const { data: results, isLoading } = useGetResults(queryParams, {
    query: { queryKey: getGetResultsQueryKey(queryParams) }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Traceability Matrix</h2>
          <p className="text-muted-foreground">Detailed evaluation results and reasoning.</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={datasetId} onValueChange={setDatasetId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Datasets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Datasets</SelectItem>
              {datasets?.map(d => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {models?.map(m => (
                <SelectItem key={m.id} value={m.id.toString()}>{m.modelName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="p-6"><Skeleton className="h-96 w-full" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-[15%]">Context</TableHead>
                <TableHead className="w-[30%]">Question</TableHead>
                <TableHead className="w-[30%]">Response</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results?.map((row) => (
                <ResultRowComponent key={`${row.responseId}-${row.evaluationId || 'none'}`} row={row} />
              ))}
              {(!results || results.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center text-muted-foreground">
                    No results found for these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ResultRowComponent({ row }: { row: any }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
      <>
        <TableRow className="cursor-pointer group" onClick={() => setIsOpen(!isOpen)}>
          <TableCell className="p-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </TableCell>
          <TableCell className="align-top py-4">
            <div className="flex flex-col gap-1">
              <Badge variant="outline" className="w-fit text-[10px]">{row.datasetName}</Badge>
              <span className="font-semibold text-sm">{row.modelName}</span>
              <span className="text-xs text-muted-foreground font-mono">{row.inferenceTimeMs ? `${row.inferenceTimeMs}ms` : ''}</span>
            </div>
          </TableCell>
          <TableCell className="align-top py-4">
            <div className="text-sm line-clamp-3 mb-2">{row.questionText}</div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Gold:</span> <span className="line-clamp-1 inline">{row.goldAnswer}</span>
            </div>
          </TableCell>
          <TableCell className="align-top py-4">
            <div className="text-sm line-clamp-4">{row.responseText}</div>
          </TableCell>
          <TableCell className="align-top py-4">
            <ScoreBadge score={row.score} />
          </TableCell>
        </TableRow>
        
        <CollapsibleContent asChild>
          <TableRow className="bg-muted/20 border-b-2 border-border/50">
            <TableCell colSpan={5} className="p-0">
              <div className="p-6 pt-2 pb-8 ml-12 grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Full Question</h4>
                    <p className="text-sm bg-background/50 p-3 rounded-md border">{row.questionText}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Gold Answer</h4>
                    <p className="text-sm bg-background/50 p-3 rounded-md border text-green-500/80">{row.goldAnswer}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Model Response</h4>
                    <p className="text-sm bg-background/50 p-3 rounded-md border">{row.responseText}</p>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                    Judge Reasoning
                    {row.judgeModelName && <Badge variant="secondary" className="text-[10px] h-5">{row.judgeModelName}</Badge>}
                  </h4>
                  {row.reasoning ? (
                    <div className="text-sm bg-primary/5 border border-primary/20 p-4 rounded-md whitespace-pre-wrap font-mono leading-relaxed">
                      {row.reasoning}
                    </div>
                  ) : (
                    <div className="text-sm bg-background/50 p-4 rounded-md border text-muted-foreground italic">
                      No evaluation recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}