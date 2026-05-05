import { useGetResults, useListModels, useListDatasets, getGetResultsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChevronRight, Filter, Download, Trash2, RotateCcw, CheckCircle2, XCircle, Eraser } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { currentUnifiedUser } from "@/components/auth-gate";

function escapeCSV(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportOpenEndedCSV(rows: any[]) {
  const headers = ["model", "dataset", "question", "gold_answer", "response", "must_have_score", "reference_answer", "score", "judge_model", "reasoning"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => [
      escapeCSV(r.modelName),
      escapeCSV(r.datasetName),
      escapeCSV(r.questionText),
      escapeCSV(r.goldAnswer),
      escapeCSV(r.responseText),
      escapeCSV(r.mustHaveScore ?? ""),
      escapeCSV(r.referenceAnswer ?? ""),
      escapeCSV(r.score ?? ""),
      escapeCSV(r.judgeModelName ?? ""),
      escapeCSV(r.reasoning ?? ""),
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `open_ended_results_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportMCQCSV(rows: any[]) {
  const headers = ["model", "dataset", "question", "gold_answer", "prediction", "correct_letter", "mcq_score"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => [
      escapeCSV(r.modelName),
      escapeCSV(r.datasetName),
      escapeCSV(r.questionText),
      escapeCSV(r.goldAnswer),
      escapeCSV(r.responseText),
      escapeCSV(r.mcqCorrect ?? ""),
      escapeCSV(r.mcqScore ?? ""),
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mcq_results_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

type DeleteTarget = { kind: "response"; responseId: number } | { kind: "evaluation"; evaluationId: number };

function canDelete(createdBy: string | null | undefined): boolean {
  if (createdBy === null || createdBy === undefined) return true;
  return currentUnifiedUser?.id === createdBy;
}

export default function Results() {
  const [datasetId, setDatasetId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"open_ended" | "mcq">("open_ended");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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

  const openEndedRows = results?.filter((r) => r.questionType === "OPEN_ENDED") ?? [];
  const mcqRows = results?.filter((r) => r.questionType === "MCQ") ?? [];

  async function clearAllResults() {
    setIsClearing(true);
    try {
      const res = await fetch("/api/results/clear-all", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast({ title: "Cleared", description: `Deleted ${data.deletedResponses} responses and ${data.deletedRefs} reference answers.` });
      queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Clear failed", description: String(e), variant: "destructive" });
    } finally {
      setIsClearing(false);
      setShowClearAll(false);
    }
  }

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
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "open_ended" | "mcq")}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <TabsList>
            <TabsTrigger value="open_ended" className="gap-1.5">
              Open-ended
              {!isLoading && (
                <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
                  {openEndedRows.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="mcq" className="gap-1.5">
              MCQ
              {!isLoading && (
                <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">
                  {mcqRows.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={activeTab === "open_ended" ? openEndedRows.length === 0 : mcqRows.length === 0}
              onClick={() => activeTab === "open_ended" ? exportOpenEndedCSV(openEndedRows) : exportMCQCSV(mcqRows)}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              disabled={!results || results.length === 0}
              onClick={() => setShowClearAll(true)}
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Open-ended tab */}
        <TabsContent value="open_ended" className="mt-0">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><Skeleton className="h-[400px] w-full" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 pl-3"></TableHead>
                        <TableHead className="w-[14%]">Model</TableHead>
                        <TableHead className="w-[28%]">Question</TableHead>
                        <TableHead className="w-[28%]">Response</TableHead>
                        <TableHead className="w-[10%] text-center">Must-Have</TableHead>
                        <TableHead className="text-right pr-4">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openEndedRows.map((row) => (
                        <OpenEndedRow
                          key={`${row.questionId}-${row.responseId || 0}-${row.evaluationId || 'none'}`}
                          row={row}
                          onDeleteResponse={(responseId) => setDeleteTarget({ kind: "response", responseId })}
                          onClearEvaluation={(evaluationId) => setDeleteTarget({ kind: "evaluation", evaluationId })}
                        />
                      ))}
                      {openEndedRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-48 text-center text-sm text-muted-foreground">
                            No open-ended responses found. Import responses or adjust filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MCQ tab */}
        <TabsContent value="mcq" className="mt-0">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6"><Skeleton className="h-[400px] w-full" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 pl-3"></TableHead>
                        <TableHead className="w-[14%]">Model</TableHead>
                        <TableHead className="w-[35%]">Question</TableHead>
                        <TableHead className="w-[10%] text-center">Prediction</TableHead>
                        <TableHead className="w-[10%] text-center">Correct</TableHead>
                        <TableHead className="text-right pr-4">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mcqRows.map((row) => (
                        <MCQRow
                          key={`${row.questionId}-${row.responseId || 0}`}
                          row={row}
                          onDeleteResponse={(responseId) => setDeleteTarget({ kind: "response", responseId })}
                        />
                      ))}
                      {mcqRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-48 text-center text-sm text-muted-foreground">
                            No MCQ responses found. Import responses or adjust filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm: clear ALL results */}
      <Dialog open={showClearAll} onOpenChange={(o) => !o && setShowClearAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all results?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p>The following will be permanently deleted:</p>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All model responses</li>
                  <li>All judge evaluations (cascaded)</li>
                  <li>All reference answers</li>
                </ul>
                <p className="text-sm font-medium text-foreground pt-1">Kept intact: Questions, Datasets, and Models.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAll(false)} disabled={isClearing}>Cancel</Button>
            <Button variant="destructive" onClick={clearAllResults} disabled={isClearing}>
              {isClearing ? "Clearing…" : "Clear all results"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: clear evaluation */}
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

      {/* Confirm: delete response */}
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

// ── Open-ended row ──────────────────────────────────────────────────────────

function OpenEndedRow({
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
            <span className="text-muted-foreground">Gold: </span>{row.goldAnswer}
          </p>
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="text-sm line-clamp-3 leading-relaxed text-muted-foreground">{row.responseText}</p>
        </TableCell>
        <TableCell className="align-top py-3 text-center">
          {row.mustHaveScore != null ? (
            <span className="text-xs font-mono font-semibold text-foreground">
              {Number(row.mustHaveScore).toFixed(2)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
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
            <TableCell colSpan={6} className="p-0">
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
                    {row.referenceAnswer && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">LLM Reference Answer</p>
                        <div className="text-sm leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-amber-900">{row.referenceAnswer}</div>
                      </div>
                    )}
                    {row.mustHaveScore != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Must-Have Score:</span>
                        <span className="text-sm font-mono font-semibold">{Number(row.mustHaveScore).toFixed(4)}</span>
                      </div>
                    )}
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

                    {(canDelete(row.responseCreatedBy) || canDelete(row.evaluationCreatedBy)) && (
                      <div className="border-t border-border pt-4 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actions</p>
                        {row.evaluationId && canDelete(row.evaluationCreatedBy) && (
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
                        {canDelete(row.responseCreatedBy) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300"
                            onClick={(e) => { e.stopPropagation(); onDeleteResponse(row.responseId); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete response
                          </Button>
                        )}
                      </div>
                    )}
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

// ── MCQ row ─────────────────────────────────────────────────────────────────

function MCQRow({
  row,
  onDeleteResponse,
}: {
  row: any;
  onDeleteResponse: (responseId: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isCorrect = row.mcqScore != null
    ? row.mcqScore.toLowerCase() === "true"
    : row.responseText?.toUpperCase() === row.mcqCorrect?.toUpperCase();

  return (
    <>
      <TableRow
        className={`cursor-pointer transition-colors ${isOpen ? 'bg-blue-50/50 border-l-2 border-l-blue-400' : 'hover:bg-muted/40'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell className="pl-3">
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90 text-blue-500' : ''}`} />
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="font-medium text-sm">{row.modelName}</p>
          <Badge variant="outline" className="text-xs mt-1 font-normal max-w-[120px] truncate block">
            {row.datasetName}
          </Badge>
        </TableCell>
        <TableCell className="align-top py-3">
          <p className="text-sm line-clamp-2 leading-relaxed">{row.questionText}</p>
        </TableCell>
        <TableCell className="align-top py-3 text-center">
          <span className="text-sm font-mono font-bold text-blue-700">{row.responseText}</span>
        </TableCell>
        <TableCell className="align-top py-3 text-center">
          {row.mcqCorrect ? (
            <span className="text-sm font-mono font-bold text-green-700">{row.mcqCorrect}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="align-top py-3 text-right pr-4">
          {row.mcqScore != null ? (
            <div className="flex items-center justify-end gap-1.5">
              {isCorrect ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className={`text-xs font-semibold ${isCorrect ? "text-green-700" : "text-red-600"}`}>
                {isCorrect ? "Correct" : "Wrong"}
              </span>
            </div>
          ) : row.mcqCorrect ? (
            <div className="flex items-center justify-end gap-1.5">
              {row.responseText?.toUpperCase() === row.mcqCorrect?.toUpperCase() ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold text-green-700">Correct</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-600">Wrong</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isOpen && (
          <TableRow className="bg-blue-50/30 hover:bg-blue-50/30">
            <TableCell colSpan={6} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-6 border-l-2 border-l-blue-400 ml-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: question + answers */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Question</p>
                      <div className="text-sm leading-relaxed bg-white border border-border rounded-lg p-3.5">{row.questionText}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Correct Answer</p>
                        <div className="text-sm font-mono font-bold bg-green-50 border border-green-200 rounded-lg p-3.5 text-green-800 text-center text-xl">
                          {row.mcqCorrect ?? row.goldAnswer}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Model Prediction</p>
                        <div className={`text-sm font-mono font-bold rounded-lg p-3.5 text-center text-xl border ${isCorrect ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                          {row.responseText}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: result + action */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Result</p>
                      <div className={`flex items-center gap-3 p-4 rounded-lg border ${isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                        {isCorrect ? (
                          <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="h-8 w-8 text-red-500 shrink-0" />
                        )}
                        <div>
                          <p className={`text-lg font-bold ${isCorrect ? "text-green-700" : "text-red-700"}`}>
                            {isCorrect ? "Correct" : "Incorrect"}
                          </p>
                          {!isCorrect && row.mcqCorrect && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Expected <span className="font-mono font-bold">{row.mcqCorrect}</span>, got <span className="font-mono font-bold">{row.responseText}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {canDelete(row.responseCreatedBy) && row.responseId > 0 && (
                      <div className="border-t border-border pt-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actions</p>
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
                    )}
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
