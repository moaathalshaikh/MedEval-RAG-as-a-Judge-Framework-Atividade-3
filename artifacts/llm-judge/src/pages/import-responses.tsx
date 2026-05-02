import { useListModels, useListDatasets } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, CheckCircle2, SkipForward, AlertCircle, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface ResponseEntry {
  questionId: number;
  modelId: number;
  responseText: string;
  inferenceTimeMs?: number | null;
}

function parseOpenEndedCSV(text: string, modelId: number): ResponseEntry[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const qIdx = header.findIndex((h) => h === "questionid" || h === "id");
  const rIdx = header.findIndex((h) => h.includes("response") || h.includes("text") || h.includes("answer"));
  const tIdx = header.findIndex((h) => h.includes("inference") || h.includes("time") || h.includes("ms"));
  const entries: ResponseEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const qId = parseInt(cols[qIdx >= 0 ? qIdx : 0]);
    const response = cols[rIdx >= 0 ? rIdx : 1]?.trim().replace(/^"|"$/g, "") ?? "";
    const latency = tIdx >= 0 ? parseInt(cols[tIdx]) || null : null;
    if (!qId || !response) continue;
    entries.push({ questionId: qId, modelId, responseText: response, inferenceTimeMs: latency });
  }
  return entries;
}

function parseMCQCSV(text: string, modelId: number): ResponseEntry[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const qIdx = header.findIndex((h) => h === "questionid" || h === "id");
  const aIdx = header.findIndex((h) => h.includes("answer") || h.includes("model") || h.includes("choice"));
  const entries: ResponseEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const qId = parseInt(cols[qIdx >= 0 ? qIdx : 0]);
    const ans = cols[aIdx >= 0 ? aIdx : 1]?.trim().replace(/^"|"$/g, "").toUpperCase();
    if (!qId || !ans) continue;
    entries.push({ questionId: qId, modelId, responseText: ans });
  }
  return entries;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function StepBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span className={`text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center shrink-0 ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
      {n}
    </span>
  );
}

export default function ImportResponses() {
  const { data: models, isLoading: isLoadingModels } = useListModels();
  const { data: datasets, isLoading: isLoadingDatasets } = useListDatasets();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [parsedEntries, setParsedEntries] = useState<ResponseEntry[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const selectedModel = models?.find((m) => m.id === selectedModelId);
  const selectedDataset = datasets?.find((d) => d.id === selectedDatasetId);
  const datasetType = selectedDataset?.datasetType ?? null;
  const canUpload = !!selectedModelId && !!selectedDatasetId;

  function resetFile() {
    setParsedEntries(null);
    setParseError(null);
    setFileName("");
    setResult(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedModelId) return;
    const text = await file.text();
    resetFile();
    setFileName(file.name);
    try {
      if (datasetType === "MCQ") {
        setParsedEntries(parseMCQCSV(text, selectedModelId));
      } else {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
          setParsedEntries(parsed.map((r: ResponseEntry) => ({ ...r, modelId: selectedModelId })));
        } else {
          setParsedEntries(parseOpenEndedCSV(text, selectedModelId));
        }
      }
    } catch (err) {
      setParseError(`Parse error: ${String(err)}`);
    }
    e.target.value = "";
  }

  async function handleImport() {
    if (!parsedEntries || parsedEntries.length === 0) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/responses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: parsedEntries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      queryClient.invalidateQueries();
      toast({ title: "Import complete", description: `${data.imported} responses imported.` });
      setParsedEntries(null);
      setFileName("");
    } catch (err) {
      toast({ title: "Import failed", description: String(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadTemplate() {
    let content: string;
    let name: string;
    if (datasetType === "MCQ") {
      content = "questionId,Model_answer\n1,A\n2,C\n3,B";
      name = "mcq_responses_template.csv";
    } else {
      content = "questionId,responseText,inferenceTimeMs\n1,\"Sample response text\",1234";
      name = "open_ended_responses_template.csv";
    }
    const blob = new Blob([content], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Responses</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload SLM-generated responses per model and dataset</p>
      </div>

      {/* Step 1 — Model */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StepBadge n={1} active />
          <p className="text-sm font-semibold text-foreground">Select Model</p>
        </div>
        {isLoadingModels ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : models && models.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setSelectedModelId(m.id); resetFile(); }}
                className={`rounded-lg border-2 p-3 text-left transition-all ${selectedModelId === m.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <p className="text-xs font-semibold text-foreground truncate">{m.modelName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.modelSize}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No models yet — add one in SLM Models</p>
        )}
      </div>

      {/* Step 2 — Dataset */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StepBadge n={2} active={!!selectedModelId} />
          <p className={`text-sm font-semibold ${selectedModelId ? "text-foreground" : "text-muted-foreground"}`}>Select Dataset</p>
        </div>
        {isLoadingDatasets ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : datasets && datasets.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={!selectedModelId}
                onClick={() => { setSelectedDatasetId(d.id); resetFile(); }}
                className={`rounded-lg border-2 p-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${selectedDatasetId === d.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-semibold text-foreground truncate mr-1">{d.datasetName}</p>
                  <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${d.datasetType === "MCQ" ? "text-blue-600 border-blue-300" : "text-green-600 border-green-300"}`}>
                    {d.datasetType === "MCQ" ? "MCQ" : "Open"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">n={d.questionCount}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No datasets yet</p>
        )}
      </div>

      {/* Step 3 — Upload */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StepBadge n={3} active={canUpload} />
          <p className={`text-sm font-semibold ${canUpload ? "text-foreground" : "text-muted-foreground"}`}>Upload Responses</p>
        </div>

        {!canUpload ? (
          <div className="border-2 border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
            Select a model and dataset above to continue
          </div>
        ) : (
          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Format hint */}
              <div className="bg-muted/50 rounded-lg p-3 text-xs border flex items-start justify-between gap-3">
                <div className="font-mono">
                  <p className="font-semibold text-foreground not-italic mb-1">Expected columns:</p>
                  {datasetType === "MCQ" ? (
                    <p className="text-primary">questionId, Model_answer <span className="font-sans text-muted-foreground italic">(single letter A–F)</span></p>
                  ) : (
                    <p className="text-primary">questionId, responseText, inferenceTimeMs <span className="font-sans text-muted-foreground italic">(optional)</span></p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-xs h-7" onClick={downloadTemplate}>
                  <Download className="h-3 w-3" /> Template
                </Button>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all hover:border-primary/50 hover:bg-accent/50 ${fileName ? "border-primary/40 bg-primary/5" : "border-border"}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {fileName ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-7 w-7 text-primary" />
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
                      onClick={(e) => { e.stopPropagation(); resetFile(); }}
                    >
                      Change file
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Drop a file or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">{datasetType === "MCQ" ? "Accepts .csv" : "Accepts .csv or .json"}</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={datasetType === "MCQ" ? ".csv" : ".json,.csv"}
                className="hidden"
                onChange={handleFile}
              />

              {parseError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}

              {parsedEntries && parsedEntries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-medium">{parsedEntries.length} records ready to import for <span className="font-semibold">{selectedModel?.modelName}</span></span>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2.5 font-medium text-muted-foreground">Q ID</th>
                          {datasetType === "MCQ" ? (
                            <th className="text-left p-2.5 font-medium text-muted-foreground">Model Answer</th>
                          ) : (
                            <>
                              <th className="text-left p-2.5 font-medium text-muted-foreground">Response</th>
                              <th className="text-right p-2.5 font-medium text-muted-foreground">Latency (ms)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {parsedEntries.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            <td className="p-2.5 font-mono">{r.questionId}</td>
                            {datasetType === "MCQ" ? (
                              <td className="p-2.5 font-mono font-bold text-primary">{r.responseText}</td>
                            ) : (
                              <>
                                <td className="p-2.5 max-w-[220px] truncate text-muted-foreground" title={r.responseText}>{r.responseText}</td>
                                <td className="p-2.5 text-right font-mono text-muted-foreground">{r.inferenceTimeMs ?? "—"}</td>
                              </>
                            )}
                          </tr>
                        ))}
                        {parsedEntries.length > 50 && (
                          <tr className="bg-muted/20">
                            <td colSpan={datasetType === "MCQ" ? 2 : 3} className="p-2.5 text-center text-xs text-muted-foreground">
                              + {parsedEntries.length - 50} more records
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button className="w-full gap-2" onClick={handleImport} disabled={isSubmitting}>
                    <Upload className="h-4 w-4" />
                    {isSubmitting ? "Importing..." : `Import ${parsedEntries.length} Responses`}
                  </Button>
                </div>
              )}

              {result && (
                <div className="pt-3 border-t border-border space-y-3">
                  <p className="text-sm font-semibold">Import Summary</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-xl font-bold text-green-700">{result.imported}</p>
                        <p className="text-xs text-green-600">Imported</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                      <SkipForward className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xl font-bold">{result.skipped}</p>
                        <p className="text-xs text-muted-foreground">Skipped</p>
                      </div>
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="text-xs text-destructive space-y-0.5 max-h-24 overflow-y-auto">
                      {result.errors.slice(0, 10).map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </motion.div>
  );
}
