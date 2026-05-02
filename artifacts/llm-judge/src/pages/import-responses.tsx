import { useListModels, useListDatasets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, CheckCircle2, SkipForward, AlertCircle, Download, FileJson } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

interface ResponseEntry {
  questionId: number;
  modelId: number;
  responseText: string;
  inferenceTimeMs?: number | null;
}

function parseCSV(text: string): ResponseEntry[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const entries: ResponseEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 3) continue;
    entries.push({
      questionId: parseInt(cols[0]),
      modelId: parseInt(cols[1]),
      responseText: cols.slice(2, cols.length > 4 ? -1 : undefined).join(",").trim().replace(/^"|"$/g, ""),
      inferenceTimeMs: cols.length > 3 ? (parseInt(cols[cols.length - 1]) || null) : null,
    });
  }
  return entries;
}

export default function ImportResponses() {
  const { data: models, isLoading: isLoadingModels } = useListModels();
  const { data: datasets, isLoading: isLoadingDatasets } = useListDatasets();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jsonText, setJsonText] = useState("");
  const [parsedEntries, setParsedEntries] = useState<ResponseEntry[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  function handleParseJSON() {
    setParseError(null);
    setParsedEntries(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) { setParseError("Expected a JSON array."); return; }
      setParsedEntries(parsed as ResponseEntry[]);
    } catch (e) {
      setParseError(`Parse error: ${String(e)}`);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setParseError(null);
    setParsedEntries(null);
    if (file.name.endsWith(".csv")) {
      try {
        const entries = parseCSV(text);
        setParsedEntries(entries);
        setJsonText(JSON.stringify(entries, null, 2));
      } catch (e) { setParseError(`CSV error: ${String(e)}`); }
    } else {
      setJsonText(text);
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) { setParseError("Expected a JSON array."); return; }
        setParsedEntries(parsed as ResponseEntry[]);
      } catch (e) { setParseError(`Parse error: ${String(e)}`); }
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
    } catch (e) {
      toast({ title: "Import failed", description: String(e), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadTemplate(format: "json" | "csv") {
    const modelId = 1;
    const questionId = 1;
    if (format === "json") {
      const template = [{ questionId, modelId, responseText: "Sample response", inferenceTimeMs: 1234 }];
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "template.json"; a.click();
    } else {
      const csv = "questionId,modelId,responseText,inferenceTimeMs\n" + `${questionId},${modelId},Sample response,1234`;
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "template.csv"; a.click();
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Responses</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload SLM-generated responses for evaluation</p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Upload Responses</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="file" className="w-full">
                <TabsList className="mb-5 w-full grid grid-cols-2">
                  <TabsTrigger value="file">File Upload</TabsTrigger>
                  <TabsTrigger value="paste">Paste JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="file">
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Drop a file or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Accepts .json or .csv files</p>
                    <p className="text-xs text-muted-foreground mt-3 font-mono bg-muted inline-block px-2 py-1 rounded">
                      questionId, modelId, responseText, inferenceTimeMs
                    </p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".json,.csv" className="hidden" onChange={handleFileUpload} />
                </TabsContent>

                <TabsContent value="paste" className="space-y-3">
                  <Textarea
                    placeholder={`[\n  {\n    "questionId": 1,\n    "modelId": 1,\n    "responseText": "...",\n    "inferenceTimeMs": 1234\n  }\n]`}
                    className="font-mono text-xs h-44 resize-y"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                  />
                  <Button variant="outline" onClick={handleParseJSON} disabled={!jsonText.trim()} className="w-full gap-2">
                    <FileJson className="h-4 w-4" /> Validate JSON
                  </Button>
                </TabsContent>
              </Tabs>

              {parseError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}

              {parsedEntries && (
                <div className="mt-5 space-y-3 border-t border-border pt-5">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-medium">{parsedEntries.length} records ready to import</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2.5 font-medium text-muted-foreground">Q ID</th>
                          <th className="text-left p-2.5 font-medium text-muted-foreground">Model ID</th>
                          <th className="text-left p-2.5 font-medium text-muted-foreground">Response Preview</th>
                          <th className="text-right p-2.5 font-medium text-muted-foreground">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {parsedEntries.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            <td className="p-2.5 font-mono">{r.questionId}</td>
                            <td className="p-2.5 font-mono text-primary">{r.modelId}</td>
                            <td className="p-2.5 max-w-[200px] truncate text-muted-foreground" title={r.responseText}>{r.responseText}</td>
                            <td className="p-2.5 text-right font-mono text-muted-foreground">{r.inferenceTimeMs ?? "—"}</td>
                          </tr>
                        ))}
                        {parsedEntries.length > 50 && (
                          <tr className="bg-muted/20">
                            <td colSpan={4} className="p-2.5 text-center text-xs text-muted-foreground">
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
                <div className="mt-5 pt-5 border-t border-border space-y-3">
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-4 space-y-4">
          {/* Model IDs reference */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Model Reference</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingModels ? <Skeleton className="h-24 w-full" /> : (
                <div className="space-y-1.5">
                  {models?.map((m) => (
                    <div key={m.id} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                      <span className="text-muted-foreground truncate mr-2">{m.modelName}</span>
                      <span className="font-mono text-xs font-semibold text-primary bg-accent px-1.5 py-0.5 rounded">{m.id}</span>
                    </div>
                  ))}
                  {(!models || models.length === 0) && <p className="text-sm text-muted-foreground">No models yet</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dataset reference */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Datasets</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingDatasets ? <Skeleton className="h-24 w-full" /> : (
                <div className="space-y-1.5">
                  {datasets?.map((d) => (
                    <div key={d.id} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                      <span className="font-medium truncate mr-2">{d.datasetName}</span>
                      <span className="text-xs text-muted-foreground">n={d.questionCount}</span>
                    </div>
                  ))}
                  {(!datasets || datasets.length === 0) && <p className="text-sm text-muted-foreground">No datasets yet</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Templates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Download Template</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => downloadTemplate("json")}>
                <Download className="h-3.5 w-3.5" /> JSON template
              </Button>
              <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => downloadTemplate("csv")}>
                <Download className="h-3.5 w-3.5" /> CSV template
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
