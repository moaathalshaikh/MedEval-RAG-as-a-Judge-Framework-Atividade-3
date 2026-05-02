import { useGetResults, useListModels, useListDatasets, getGetResultsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ListTree, Database, Server } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground flex items-center gap-3">
            <ListTree className="h-6 w-6 text-primary" />
            Traceability Matrix
          </h2>
          <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Inspection & Verification Log</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-[200px]">
            <div className="absolute -top-2 left-2 bg-background px-1 text-[9px] font-mono text-muted-foreground z-10 uppercase tracking-widest flex items-center gap-1">
              <Database className="h-2 w-2" /> Corpus
            </div>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger className="rounded-none bg-background font-mono text-xs h-10 border-border">
                <SelectValue placeholder="ALL DATASETS" />
              </SelectTrigger>
              <SelectContent className="rounded-none font-mono text-xs">
                <SelectItem value="all">ALL DATASETS</SelectItem>
                {datasets?.map(d => (
                  <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full sm:w-[200px]">
            <div className="absolute -top-2 left-2 bg-background px-1 text-[9px] font-mono text-muted-foreground z-10 uppercase tracking-widest flex items-center gap-1">
              <Server className="h-2 w-2" /> Target Model
            </div>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger className="rounded-none bg-background font-mono text-xs h-10 border-border">
                <SelectValue placeholder="ALL MODELS" />
              </SelectTrigger>
              <SelectContent className="rounded-none font-mono text-xs">
                <SelectItem value="all">ALL MODELS</SelectItem>
                {models?.map(m => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.modelName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8"><Skeleton className="h-[600px] w-full rounded-none" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-12 border-r border-border/30"></TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-[15%] border-r border-border/30">Parameters</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-[30%] border-r border-border/30">Input Context</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-[35%] border-r border-border/30">Output Capture</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 text-right">Eval</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results?.map((row) => (
                  <ResultRowComponent key={`${row.responseId}-${row.evaluationId || 'none'}`} row={row} />
                ))}
                {(!results || results.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      No matching records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function ResultRowComponent({ row }: { row: any }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <TableRow
        className={`cursor-pointer border-border/30 transition-colors ${isOpen ? 'bg-primary/5' : 'hover:bg-muted/10'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="p-0 border-r border-border/30">
          <div className="h-full w-full flex items-center justify-center min-h-[80px]">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90 text-primary' : ''}`} />
          </div>
        </TableCell>
        <TableCell className="align-top p-4 border-r border-border/30">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-sm">{row.modelName}</span>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="rounded-none bg-background text-[9px] font-mono text-muted-foreground uppercase px-1.5 border-border/50 max-w-[120px] truncate block">
                {row.datasetName}
              </Badge>
              {row.inferenceTimeMs && (
                <Badge variant="outline" className="rounded-none bg-background text-[9px] font-mono text-muted-foreground px-1.5 border-border/50">
                  {row.inferenceTimeMs}ms
                </Badge>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="align-top p-4 border-r border-border/30">
          <div className="text-sm line-clamp-2 leading-relaxed opacity-90">{row.questionText}</div>
          <div className="text-xs font-mono text-green-500/70 mt-2 truncate max-w-[300px]">
            <span className="text-[9px] text-muted-foreground mr-1 tracking-widest uppercase">Target:</span>
            {row.goldAnswer}
          </div>
        </TableCell>
        <TableCell className="align-top p-4 border-r border-border/30">
          <div className="text-sm line-clamp-3 leading-relaxed opacity-80">{row.responseText}</div>
        </TableCell>
        <TableCell className="align-top p-4 text-right">
          <ScoreBadge score={row.score} />
          {row.evaluatedAt && (
            <div className="text-[9px] font-mono text-muted-foreground mt-2 uppercase tracking-widest">
              {new Date(row.evaluatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </div>
          )}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isOpen && (
          <TableRow className="bg-background border-b-2 border-primary/20">
            <TableCell colSpan={5} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="p-6 md:p-8 ml-12 grid grid-cols-1 lg:grid-cols-12 gap-8 border-l border-primary/20 relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-primary/30" />

                <div className="lg:col-span-7 space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <div className="h-1 w-1 bg-muted-foreground rounded-full" /> Input Prompt
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground/90 p-4 bg-muted/10 border border-border/50">{row.questionText}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-green-500/80 flex items-center gap-2">
                      <div className="h-1 w-1 bg-green-500/80 rounded-full" /> Target Criteria (Gold)
                    </h4>
                    <p className="text-sm leading-relaxed text-green-600/90 p-4 bg-green-500/5 border border-green-500/20">{row.goldAnswer}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary/80 flex items-center gap-2">
                      <div className="h-1 w-1 bg-primary/80 rounded-full" /> Generated Output
                    </h4>
                    <p className="text-sm leading-relaxed text-foreground/90 p-4 bg-primary/5 border border-primary/20">{row.responseText}</p>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground flex items-center justify-between border-b border-border/50 pb-2 mb-4">
                    <span>Evaluator Telemetry</span>
                    {row.judgeModelName && (
                      <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[9px]">
                        {row.judgeModelName}
                      </span>
                    )}
                  </h4>

                  <div className="mb-4">
                    <ScoreBadge score={row.score} />
                  </div>

                  {row.reasoning ? (
                    <div className="space-y-2 mt-4">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block">Analysis Matrix</span>
                      <div className="text-xs font-mono text-muted-foreground bg-black/40 border border-border/30 p-5 whitespace-pre-wrap leading-relaxed h-[280px] overflow-y-auto">
                        <span className="text-primary opacity-50">&gt; Begin Trace</span>{"\n\n"}
                        {row.reasoning}
                        {"\n\n"}<span className="text-primary opacity-50">&gt; EOF</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center justify-center h-32 border border-dashed border-border/50">
                      Awaiting Evaluation
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