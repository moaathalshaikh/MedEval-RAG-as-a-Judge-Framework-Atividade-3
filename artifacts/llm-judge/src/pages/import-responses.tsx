import { useListModels, useListDatasets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, CheckSquare, AlertTriangle, FileCode, Download, Braces } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

  const [filterModelId, setFilterModelId] = useState("");

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
      setParseError(`JSON Parsing Fault: ${String(e)}`);
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
        setParseError(`CSV Parsing Fault: ${String(e)}`);
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
        setParseError(`JSON Parsing Fault: ${String(e)}`);
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
      if (!res.ok) throw new Error(data.error || "Ingestion pipeline failure");
      setResult(data);
      queryClient.invalidateQueries();
      toast({ title: "Ingestion Complete", description: `Successfully processed ${data.imported} records.` });
    } catch (e) {
      toast({ title: "Ingestion Fault", description: String(e), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadTemplate(format: "json" | "csv") {
    const modelId = filterModelId ? parseInt(filterModelId) : 1;
    const questionId = 1;
    if (format === "json") {
      const template = [
        { questionId, modelId, responseText: "Sample generated output", inferenceTimeMs: 1234 },
      ];
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "responses_template.json"; a.click();
    } else {
      const csv = "questionId,modelId,responseText,inferenceTimeMs\n" +
        `${questionId},${modelId},Sample generated output,1234`;
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "responses_template.csv"; a.click();
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="border-b border-border pb-6">
        <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground flex items-center gap-3">
          <Upload className="h-6 w-6 text-primary" />
          Data Ingestion Pipeline
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Upload External SLM Inference Outputs</p>
      </div>

      <div className="grid gap-8 md:grid-cols-12 align-top">
        <div className="md:col-span-8 space-y-8">
          <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <FileCode className="h-4 w-4" /> Payload Receiver
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs defaultValue="file" className="w-full">
                <TabsList className="mb-6 rounded-none bg-muted/50 border border-border w-full grid grid-cols-2">
                  <TabsTrigger value="file" className="rounded-none font-mono text-xs uppercase tracking-widest data-[state=active]:bg-background">File Upload</TabsTrigger>
                  <TabsTrigger value="paste" className="rounded-none font-mono text-xs uppercase tracking-widest data-[state=active]:bg-background">Paste Array</TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="space-y-4">
                  <div
                    className="border border-dashed border-border bg-background/50 rounded-none p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-sm font-mono uppercase tracking-widest mb-2 group-hover:text-primary transition-colors">Select Payload (.json, .csv)</p>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                      Schema: questionId, modelId, responseText, inferenceTimeMs
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

                <TabsContent value="paste" className="space-y-4 flex flex-col">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex justify-between items-center">
                      <span>Raw JSON Array</span>
                      <Braces className="h-3 w-3" />
                    </Label>
                    <Textarea
                      placeholder={`[\n  {\n    "questionId": 1,\n    "modelId": 1,\n    "responseText": "Output...",\n    "inferenceTimeMs": 1234\n  }\n]`}
                      className="font-mono text-xs h-48 resize-y rounded-none bg-background/50 border-border"
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                    />
                  </div>
                  <Button variant="secondary" onClick={handleParseJSON} disabled={!jsonText.trim()} className="w-full rounded-none font-mono text-xs uppercase tracking-widest h-10">
                    <FileCode className="mr-2 h-4 w-4" /> Validate Schema
                  </Button>
                </TabsContent>
              </Tabs>

              {parseError && (
                <Alert variant="destructive" className="mt-6 rounded-none border-destructive/50 bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="font-mono uppercase tracking-widest text-xs">Validation Error</AlertTitle>
                  <AlertDescription className="font-mono text-[10px] mt-1">{parseError}</AlertDescription>
                </Alert>
              )}

              {parsedEntries && (
                <div className="mt-8 space-y-4 border-t border-border/50 pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-widest">
                      Valid Payload: {parsedEntries.length} Records
                    </span>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto border border-border bg-background">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-muted/30 sticky top-0 border-b border-border">
                        <tr>
                          <th className="text-left p-2 font-normal uppercase tracking-widest text-[10px] text-muted-foreground">Q-ID</th>
                          <th className="text-left p-2 font-normal uppercase tracking-widest text-[10px] text-muted-foreground">M-ID</th>
                          <th className="text-left p-2 font-normal uppercase tracking-widest text-[10px] text-muted-foreground">Preview</th>
                          <th className="text-right p-2 font-normal uppercase tracking-widest text-[10px] text-muted-foreground">Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedEntries.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-muted/10">
                            <td className="p-2 text-muted-foreground">{String(r.questionId).padStart(4, '0')}</td>
                            <td className="p-2 text-primary">{String(r.modelId).padStart(4, '0')}</td>
                            <td className="p-2 max-w-[200px] truncate opacity-90" title={r.responseText}>
                              {r.responseText}
                            </td>
                            <td className="p-2 text-right text-muted-foreground">{r.inferenceTimeMs ?? "-"}</td>
                          </tr>
                        ))}
                        {parsedEntries.length > 50 && (
                          <tr className="bg-muted/10">
                            <td colSpan={4} className="p-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                              + {parsedEntries.length - 50} TRUNCATED RECORDS
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    className="w-full rounded-none font-mono text-xs uppercase tracking-widest h-12"
                    onClick={handleImport}
                    disabled={isSubmitting}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Executing..." : `Ingest ${parsedEntries.length} Records`}
                  </Button>
                </div>
              )}

              {result && (
                <div className="mt-8 pt-6 border-t border-border/50">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Telemetry Result</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="rounded-none bg-primary/5 border-primary/30">
                      <CardContent className="p-4 flex flex-col items-center">
                        <CheckSquare className="h-6 w-6 text-primary mb-2 opacity-80" />
                        <div className="text-3xl font-light font-mono text-primary">{result.imported}</div>
                        <div className="text-[10px] font-mono tracking-widest uppercase text-primary/70 mt-1">Committed</div>
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
                      <AlertTitle className="font-mono text-xs uppercase tracking-widest">Pipeline Faults</AlertTitle>
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
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                <span>Model IDs</span>
                <Badge variant="outline" className="rounded-none font-mono text-[9px] bg-background">REF</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-4 pb-4">
              {isLoadingModels ? (
                <Skeleton className="h-32 w-full rounded-none" />
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2">
                  {models?.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[11px] font-mono border-b border-border/50 pb-1.5 last:border-0">
                      <span className="truncate mr-2 text-muted-foreground">{m.modelName}</span>
                      <span className="text-primary">{String(m.id).padStart(4, '0')}</span>
                    </div>
                  ))}
                  {(!models || models.length === 0) && <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-4 text-center">No Models Configured</div>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                <span>Corpus Data</span>
                <Badge variant="outline" className="rounded-none font-mono text-[9px] bg-background">INFO</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-4 pb-4">
              {isLoadingDatasets ? (
                <Skeleton className="h-32 w-full rounded-none" />
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {datasets?.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-[11px] font-mono border-b border-border/50 pb-2 last:border-0">
                      <span className="truncate mr-2 font-sans font-medium text-foreground">{d.datasetName}</span>
                      <span className="text-muted-foreground text-[10px]">n={d.questionCount}</span>
                    </div>
                  ))}
                  {(!datasets || datasets.length === 0) && <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-4 text-center">No Datasets Found</div>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Reference Formats
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-4 pb-4 space-y-2">
              <Button variant="outline" size="sm" className="w-full rounded-none font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground" onClick={() => downloadTemplate("json")}>
                <Download className="mr-2 h-3 w-3" /> JSON Schema
              </Button>
              <Button variant="outline" size="sm" className="w-full rounded-none font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground" onClick={() => downloadTemplate("csv")}>
                <Download className="mr-2 h-3 w-3" /> CSV Schema
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}