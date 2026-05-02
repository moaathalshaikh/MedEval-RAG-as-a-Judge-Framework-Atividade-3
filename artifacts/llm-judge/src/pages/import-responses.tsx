import { useListModels, useListDatasets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, CheckCircle2, AlertCircle, FileJson, Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const [filterModelId, setFilterModelId] = useState("");
  const [filterDatasetId, setFilterDatasetId] = useState("");

  function handleParseJSON() {
    setParseError(null);
    setParsedEntries(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setParseError("Expected a JSON array of response objects.");
        return;
      }
      setParsedEntries(parsed as ResponseEntry[]);
    } catch (e) {
      setParseError(`Invalid JSON: ${String(e)}`);
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
      } catch (e) {
        setParseError(`CSV parse error: ${String(e)}`);
      }
    } else {
      setJsonText(text);
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setParseError("Expected a JSON array of response objects.");
          return;
        }
        setParsedEntries(parsed as ResponseEntry[]);
      } catch (e) {
        setParseError(`Invalid JSON: ${String(e)}`);
      }
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
      toast({ title: "Import Complete", description: `Imported ${data.imported} responses.` });
    } catch (e) {
      toast({ title: "Import Failed", description: String(e), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadTemplate(format: "json" | "csv") {
    const modelId = filterModelId ? parseInt(filterModelId) : 1;
    const questionId = 1;
    if (format === "json") {
      const template = [
        { questionId, modelId, responseText: "Sample response text", inferenceTimeMs: 1234 },
      ];
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "responses_template.json"; a.click();
    } else {
      const csv = "question_id,model_id,response_text,inference_time_ms\n" +
        `${questionId},${modelId},Sample response text,1234`;
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "responses_template.csv"; a.click();
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Import SLM Responses</h2>
        <p className="text-muted-foreground">
          Upload responses generated by external Small Language Models (SLMs) for judge evaluation.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Responses</CardTitle>
              <CardDescription>
                Import a JSON array or CSV file containing SLM-generated responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="file">
                <TabsList className="mb-4">
                  <TabsTrigger value="file">File Upload</TabsTrigger>
                  <TabsTrigger value="paste">Paste JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="space-y-4">
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">Click to upload JSON or CSV</p>
                    <p className="text-xs text-muted-foreground">
                      JSON array or CSV with columns: question_id, model_id, response_text, inference_time_ms
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </TabsContent>

                <TabsContent value="paste" className="space-y-4">
                  <div className="space-y-2">
                    <Label>JSON Array</Label>
                    <Textarea
                      placeholder={`[\n  {\n    "questionId": 1,\n    "modelId": 1,\n    "responseText": "The answer is...",\n    "inferenceTimeMs": 1234\n  }\n]`}
                      className="font-mono text-xs h-48 resize-y"
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={handleParseJSON} disabled={!jsonText.trim()}>
                    <FileJson className="mr-2 h-4 w-4" /> Parse JSON
                  </Button>
                </TabsContent>
              </Tabs>

              {parseError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Parse Error</AlertTitle>
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}

              {parsedEntries && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">
                      {parsedEntries.length} responses ready to import
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium">Q ID</th>
                          <th className="text-left p-2 font-medium">Model ID</th>
                          <th className="text-left p-2 font-medium">Response (preview)</th>
                          <th className="text-left p-2 font-medium">Time (ms)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedEntries.slice(0, 20).map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="p-2 font-mono">{r.questionId}</td>
                            <td className="p-2 font-mono">{r.modelId}</td>
                            <td className="p-2 max-w-[200px] truncate" title={r.responseText}>
                              {r.responseText}
                            </td>
                            <td className="p-2 font-mono">{r.inferenceTimeMs ?? "-"}</td>
                          </tr>
                        ))}
                        {parsedEntries.length > 20 && (
                          <tr className="border-t border-border">
                            <td colSpan={4} className="p-2 text-center text-muted-foreground">
                              ... and {parsedEntries.length - 20} more
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleImport}
                    disabled={isSubmitting}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Importing..." : `Import ${parsedEntries.length} Responses`}
                  </Button>
                </div>
              )}

              {result && (
                <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-lg font-medium border-b border-border pb-2">Import Results</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-primary/10 border-primary/20">
                      <CardContent className="p-4 flex flex-col items-center">
                        <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
                        <div className="text-3xl font-bold">{result.imported}</div>
                        <div className="text-sm text-muted-foreground">Imported</div>
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
                        <ul className="list-disc pl-4 mt-2 max-h-32 overflow-y-auto">
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Registered SLMs</CardTitle>
              <CardDescription className="text-xs">Use these IDs in your import file</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoadingModels ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                models?.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2">
                    <span className="font-medium truncate">{m.modelName}</span>
                    <Badge variant="outline" className="font-mono ml-2 shrink-0">ID: {m.id}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Datasets & Questions</CardTitle>
              <CardDescription className="text-xs">Question IDs for your import file</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoadingDatasets ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                datasets?.map((d) => (
                  <div key={d.id} className="text-sm border border-border rounded-md px-3 py-2">
                    <div className="font-medium truncate">{d.datasetName}</div>
                    <div className="text-xs text-muted-foreground">{d.questionCount} questions</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Download Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => downloadTemplate("json")}>
                <Download className="mr-2 h-3 w-3" /> JSON Template
              </Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => downloadTemplate("csv")}>
                <Download className="mr-2 h-3 w-3" /> CSV Template
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
