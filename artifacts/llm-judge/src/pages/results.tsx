import { useGetResults, useListModels, useListDatasets, getGetResultsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChevronRight, Filter, Download, Trash2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

function escapeCSV(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportResultsCSV(rows: any[]) {
  const headers = ["model", "dataset", "question", "gold_answer", "response", "score", "judge_model", "reasoning", "evaluated_at"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => [
      escapeCSV(r.modelName),
      escapeCSV(r.datasetName),
      escapeCSV(r.questionText),
      escapeCSV(r.goldAnswer),
      escapeCSV(r.responseText),
      escapeCSV(r.score ?? ""),
      escapeCSV(r.judgeModelName ?? ""),
      escapeCSV(r.reasoning ?? ""),
      escapeCSV(r.evaluatedAt ? new Date(r.evaluatedAt).toISOString() : ""),
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `results_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

type DeleteTarget = { kind: "response"; responseId: number } | { kind: "evaluation"; evaluationId: number };

export default function Results() {
  const [datasetId, setDatasetId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: models } = useListModels();
  const { data: datasets } = useListDatasets();

  const queryParams = {
    datasetId: datasetId !== "all" && datasetId !== "" ? parseInt(datasetId) : undefined,
    modelId: modelId !== "all" && modelId !== "" ? parseInt(modelId) : undefined,
  };

  const { data: results, isLoading } = useGetResults(queryParams, {
    query: { queryKey: getGetResultsQueryKey(queryParams) }
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "response") {
        const res = await fetch(`/api/responses/${deleteTarget.responseId}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error);
        toast({ title: "Response deleted", description: "The response and its evaluation have been removed." });
      } else {
        const res = await fetch(`/api/evaluations/${deleteTarget.evaluationId}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error);
        toast({ title: "Evaluation cleared", description: "The score has been removed. You can re-evaluate this response." });
      }
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Results</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse and inspect evaluation outcomes</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={datasetId} onValueChange={setDatasetId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All datasets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All datasets</SelectItem>
              {datasets?.map(d => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.datasetName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {models?.map(m => (
                <SelectItem key={m.id} value={m.id.toString()}>{m.modelName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={!results || results.length === 0}
            onClick={() => results && exportResultsCSV(results)}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
            {results && results.length > 0 && (
              <span className="text-xs text-muted-foreground ml-0.5">({results.length})</span>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-[500px] w-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-3"></TableHead>
                    <TableHead className="w-[16%]">Model</TableHead>
                    <TableHead className="w-[30%]">Question</TableHead>
                    <TableHead className="w-[35%]">Response</TableHead>
                    <TableHead className="text-right pr-4">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results?.map((row) => (
                    <ResultRowComponent
                      key={`${row.questionId}-${row.responseId || 0}-${row.evaluationId || 'none'}`}
                      row={row}
                      onDeleteResponse={(responseId) => setDeleteTarget({ kind: "response", responseId })}
                      onClearEvaluation={(evaluationId) => setDeleteTarget({ kind: "evaluation", evaluationId })}
                    />
                  ))}
                  {(!results || results.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-64 text-center text-sm text-muted-foreground">
                        No results found. Run an evaluation to see results here.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm: clear evaluation — rendered outside table */}
      <Dialog open={deleteTarget?.kind === "evaluation"} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear evaluation score?</DialogTitle>
            <DialogDescription>
              This removes the judge score and reasoning for this response. The response itself stays — you can re-evaluate it afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Clearing…" : "Clear score"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete response — rendered outside table */}
      <Dialog open={deleteTarget?.kind === "response"} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this response?</DialogTitle>
            <DialogDescription>
              This permanently removes the model response and its evaluation. You can re-import this response later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function ResultRowComponent({
  row,
  onDeleteResponse,
  onClearEvaluation,
}: {
  row: any;
  onDeleteResponse: (responseId: number) => void;
  onClearEvaluation: (evaluationId: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <TableRow
        className={`cursor-pointer transition-colors ${isOpen ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/40'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="pl-3">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90 text-primary' : ''}`} />
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="font-medium text-sm">{row.modelName}</p>
          <Badge variant="outline" className="text-xs mt-1 font-normal max-w-[120px] truncate block">
            {row.datasetName}
          </Badge>
          {row.inferenceTimeMs && (
            <p className="text-xs text-muted-foreground mt-1">{row.inferenceTimeMs}ms</p>
          )}
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="text-sm line-clamp-2 leading-relaxed">{row.questionText}</p>
          <p className="text-xs text-green-600 mt-1.5 line-clamp-1">
            <span className="text-muted-foreground">Answer: </span>{row.goldAnswer}
          </p>
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="text-sm line-clamp-3 leading-relaxed text-muted-foreground">{row.responseText}</p>
        </TableCell>
        <TableCell className="align-top py-3 text-right pr-4">
          <ScoreBadge score={row.score} />
          {row.evaluatedAt && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {new Date(row.evaluatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          )}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isOpen && (
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableCell colSpan={5} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-6 border-l-2 border-l-primary ml-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: full text */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question</p>
                      <div className="text-sm leading-relaxed bg-white border border-border rounded-lg p-3.5">{row.questionText}</div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Gold Answer</p>
                      <div className="text-sm leading-relaxed bg-green-50 border border-green-200 rounded-lg p-3.5 text-green-800">{row.goldAnswer}</div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide">Model Response</p>
                      <div className="text-sm leading-relaxed bg-blue-50 border border-blue-200 rounded-lg p-3.5">{row.responseText}</div>
                    </div>
                  </div>

                  {/* Right: judge details + actions */}
                  <div className="lg:col-span-5 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Evaluation</p>
                        {row.judgeModelName && (
                          <Badge variant="secondary" className="text-xs">{row.judgeModelName}</Badge>
                        )}
                      </div>
                      <div className="mb-4">
                        <ScoreBadge score={row.score} />
                      </div>
                      {row.reasoning ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Judge Reasoning</p>
                          <div className="text-sm leading-relaxed bg-white border border-border rounded-lg p-3.5 max-h-[200px] overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                            {row.reasoning}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-28 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                          Not yet evaluated
                        </div>
                      )}
                    </div>

                    {/* Delete actions */}
                    <div className="border-t border-border pt-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actions</p>
                      {row.evaluationId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 text-amber-700 border-amber-200 hover:bg-amber-50 hover:border-amber-300"
                          onClick={(e) => { e.stopPropagation(); onClearEvaluation(row.evaluationId); }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Clear evaluation score
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300"
                        onClick={(e) => { e.stopPropagation(); onDeleteResponse(row.responseId); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete response
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}
