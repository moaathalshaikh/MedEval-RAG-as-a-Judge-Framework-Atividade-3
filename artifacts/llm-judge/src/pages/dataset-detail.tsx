import { useParams, Link } from "wouter";
import {
  useGetDataset, useListQuestions, useCreateQuestion, useDeleteQuestion, useUploadDataset,
  getGetDatasetQueryKey, getListQuestionsQueryKey, CreateQuestionBodyQuestionType, UploadDatasetBodyFormat,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, ChevronLeft, Plus, Upload, FileJson, FileText, Files, CheckCircle2, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";

const questionSchema = z.object({
  questionText: z.string().min(1, "Question text is required"),
  goldAnswer: z.string().min(1, "Gold answer is required"),
  questionType: z.nativeEnum(CreateQuestionBodyQuestionType),
});
type QuestionFormValues = z.infer<typeof questionSchema>;

// ─── CSV parser (handles quoted commas) ──────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = parseCSVLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

function extractCorrectLetter(val: string): string | null {
  const m = val.trim().match(/\(?([A-Fa-f])\)?/);
  return m ? m[1].toUpperCase() : null;
}

export default function DatasetDetail() {
  const { id } = useParams();
  const datasetId = parseInt(id || "0");
  const { toast } = useToast();

  const { data: dataset, isLoading: isDatasetLoading } = useGetDataset(datasetId, {
    query: { enabled: !!datasetId, queryKey: getGetDatasetQueryKey(datasetId) }
  });
  const { data: questions, isLoading: isQuestionsLoading } = useListQuestions({ datasetId }, {
    query: { enabled: !!datasetId, queryKey: getListQuestionsQueryKey({ datasetId }) }
  });

  const createQuestion = useCreateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const uploadDataset = useUploadDataset();
  const queryClient = useQueryClient();

  // ── Single question form ──
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { questionText: "", goldAnswer: "", questionType: CreateQuestionBodyQuestionType.OPEN_ENDED },
  });

  function onSubmit(data: QuestionFormValues) {
    createQuestion.mutate({ data: { ...data, datasetId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
        queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        form.reset();
        toast({ title: "Question added" });
      },
    });
  }

  function handleDelete(questionId: number) {
    if (confirm("Delete this question?")) {
      deleteQuestion.mutate({ id: questionId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
          queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        },
      });
    }
  }

  // ── JSONL upload ──
  const [jsonlContent, setJsonlContent] = useState("");
  const jsonlFileRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  async function handleJsonlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setJsonlContent(await file.text());
    e.target.value = "";
  }

  function handleJsonlUpload() {
    if (!jsonlContent.trim()) return;
    setUploadResult(null);
    uploadDataset.mutate({ data: { datasetId, content: jsonlContent, format: UploadDatasetBodyFormat.jsonl } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
        queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        setJsonlContent("");
        setUploadResult(res);
        toast({ title: "Upload complete", description: `${res.imported} questions imported` });
      },
      onError: (err) => toast({ title: "Upload failed", description: err.error || "Error", variant: "destructive" }),
    });
  }

  // ── MCQ CSV single (with answers) ──
  const [mcqCsvContent, setMcqCsvContent] = useState("");
  const [mcqPreview, setMcqPreview] = useState<{ count: number; hasAnswers: boolean } | null>(null);
  const mcqFileRef = useRef<HTMLInputElement>(null);

  async function handleMcqFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    setMcqCsvContent(text);
    const { headers, rows } = parseCSV(text);
    const hasAnswers = headers.includes("Correct_answer");
    setMcqPreview({ count: rows.length, hasAnswers });
    e.target.value = "";
  }

  function handleMcqUpload() {
    if (!mcqCsvContent.trim()) return;
    setUploadResult(null);
    uploadDataset.mutate({ data: { datasetId, content: mcqCsvContent, format: UploadDatasetBodyFormat.csv } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
        queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        setMcqCsvContent(""); setMcqPreview(null);
        setUploadResult(res);
        toast({ title: "MCQ upload complete", description: `${res.imported} questions imported` });
      },
      onError: (err) => toast({ title: "Upload failed", description: err.error || "Error", variant: "destructive" }),
    });
  }

  // ── MCQ CSV Pair (questions + answers matched by ID) ──
  const [pairQFile, setPairQFile] = useState<string | null>(null);   // without answers
  const [pairAFile, setPairAFile] = useState<string | null>(null);   // with answers
  const [pairQName, setPairQName] = useState("");
  const [pairAName, setPairAName] = useState("");
  const [pairPreview, setPairPreview] = useState<{ matched: number; unmatched: number } | null>(null);
  const pairQRef = useRef<HTMLInputElement>(null);
  const pairARef = useRef<HTMLInputElement>(null);

  async function handlePairQFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPairQFile(await file.text()); setPairQName(file.name); e.target.value = "";
    setPairPreview(null);
  }
  async function handlePairAFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPairAFile(await file.text()); setPairAName(file.name); e.target.value = "";
    setPairPreview(null);
  }

  function buildPairPreview() {
    if (!pairQFile || !pairAFile) return;
    const qParsed = parseCSV(pairQFile);
    const aParsed = parseCSV(pairAFile);
    const answerMap = new Map<string, string>();
    aParsed.rows.forEach(r => { if (r["ID"]) answerMap.set(r["ID"].trim(), r["Correct_answer"] ?? ""); });
    const matched = qParsed.rows.filter(r => answerMap.has(r["ID"]?.trim())).length;
    const unmatched = qParsed.rows.length - matched;
    setPairPreview({ matched, unmatched });
  }

  function handlePairUpload() {
    if (!pairQFile || !pairAFile) return;
    setUploadResult(null);
    const qParsed = parseCSV(pairQFile);
    const aParsed = parseCSV(pairAFile);

    // Build answer map keyed by ID
    const answerMap = new Map<string, Record<string, string>>();
    aParsed.rows.forEach(r => { if (r["ID"]) answerMap.set(r["ID"].trim(), r); });

    // Merge: for each question row, find the answer and build a JSONL record
    const jsonlLines: string[] = [];
    qParsed.rows.forEach(row => {
      const questionText = row["Question_text"] ?? "";
      if (!questionText) return;

      // Collect choices
      const choices: Record<string, string> = {};
      ["A", "B", "C", "D", "E", "F"].forEach(letter => {
        const val = row[`(${letter})`] ?? "";
        if (val) choices[letter] = val;
      });

      // Look up answer
      const aRow = answerMap.get(row["ID"]?.trim());
      let goldAnswer = "(no answer provided)";
      if (aRow?.["Correct_answer"]) {
        const letter = extractCorrectLetter(aRow["Correct_answer"]);
        if (letter && choices[letter]) {
          goldAnswer = `(${letter}) ${choices[letter]}`;
        } else {
          goldAnswer = aRow["Correct_answer"];
        }
      }

      jsonlLines.push(JSON.stringify({
        questionText,
        goldAnswer,
        questionType: "MCQ",
        metadata: {
          choices,
          question_name: row["Question_name"] ?? "",
          external_id: row["ID"] ?? "",
        },
      }));
    });

    const content = jsonlLines.join("\n");
    uploadDataset.mutate({ data: { datasetId, content, format: UploadDatasetBodyFormat.jsonl } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
        queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        setPairQFile(null); setPairAFile(null); setPairPreview(null); setPairQName(""); setPairAName("");
        setUploadResult(res);
        toast({ title: "MCQ pair upload complete", description: `${res.imported} questions imported` });
      },
      onError: (err) => toast({ title: "Upload failed", description: err.error || "Error", variant: "destructive" }),
    });
  }

  if (isDatasetLoading) return <Skeleton className="h-[400px] w-full" />;
  if (!dataset) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Dataset not found.</p>
      <Link href="/datasets"><Button variant="link" className="mt-2">Back to Datasets</Button></Link>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">

      {/* Header */}
      <div>
        <Link href="/datasets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft className="h-4 w-4" /> Back to Datasets
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">{dataset.datasetName}</h1>
          <Badge variant="secondary">{dataset.domain}</Badge>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">{dataset.questionCount} questions</Badge>
        </div>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <Alert className={uploadResult.errors.length > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <span className="font-semibold text-green-700">{uploadResult.imported} imported</span>
            {uploadResult.skipped > 0 && <span className="text-muted-foreground ml-2">· {uploadResult.skipped} skipped</span>}
            {uploadResult.errors.length > 0 && (
              <details className="mt-2 text-xs text-amber-700">
                <summary className="cursor-pointer">{uploadResult.errors.length} warning(s)</summary>
                <pre className="mt-1 whitespace-pre-wrap">{uploadResult.errors.slice(0, 10).join("\n")}</pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Upload section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Bulk Upload
          </CardTitle>
          <p className="text-xs text-muted-foreground">Three supported formats — choose the one that matches your file</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="jsonl">
            <TabsList className="grid grid-cols-3 w-full mb-5">
              <TabsTrigger value="jsonl" className="gap-1.5 text-xs">
                <FileJson className="h-3.5 w-3.5" /> Open-ended JSONL
              </TabsTrigger>
              <TabsTrigger value="mcq-single" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> MCQ CSV (with answers)
              </TabsTrigger>
              <TabsTrigger value="mcq-pair" className="gap-1.5 text-xs">
                <Files className="h-3.5 w-3.5" /> MCQ Pair (2 files)
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: JSONL ──────────────────────────────────────────── */}
            <TabsContent value="jsonl" className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono text-muted-foreground border border-border">
                <p className="font-semibold text-foreground mb-1">Expected format (one JSON per line):</p>
                <p className="text-green-700">{"{"}"Question": "What is X?", "Free_form_answer": "X is ..."{"}"}</p>
                <p className="text-muted-foreground/70 mt-0.5">Also accepted: <span className="text-blue-600">questionText / goldAnswer</span></p>
              </div>

              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-all"
                onClick={() => jsonlFileRef.current?.click()}
              >
                <FileJson className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drop .jsonl file or click to browse</p>
                {jsonlContent && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ {jsonlContent.split("\n").filter(l => l.trim()).length} lines loaded
                  </p>
                )}
              </div>
              <input ref={jsonlFileRef} type="file" accept=".jsonl,.json" className="hidden" onChange={handleJsonlFile} />

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Or paste directly:</p>
                <Textarea
                  value={jsonlContent}
                  onChange={e => setJsonlContent(e.target.value)}
                  placeholder={'{"Question": "...", "Free_form_answer": "..."}'}
                  className="font-mono text-xs h-28 resize-none"
                />
              </div>

              <Button className="w-full gap-2" onClick={handleJsonlUpload} disabled={uploadDataset.isPending || !jsonlContent.trim()}>
                <Upload className="h-4 w-4" />
                {uploadDataset.isPending ? "Uploading..." : `Upload JSONL`}
              </Button>
            </TabsContent>

            {/* ── Tab 2: MCQ CSV single ─────────────────────────────────── */}
            <TabsContent value="mcq-single" className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono text-muted-foreground border border-border">
                <p className="font-semibold text-foreground mb-1">Expected columns:</p>
                <p className="text-primary">ID, Question_name, Question_text, (A), (B), (C), (D), (E), (F), <span className="font-bold text-green-700">Correct_answer</span></p>
                <p className="text-muted-foreground/70 mt-0.5">The <span className="text-green-700">Correct_answer</span> column is used as the gold standard</p>
              </div>

              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-all"
                onClick={() => mcqFileRef.current?.click()}
              >
                <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drop .csv file or click to browse</p>
                {mcqPreview && (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-xs text-green-600">✓ {mcqPreview.count} rows detected</p>
                    {mcqPreview.hasAnswers
                      ? <p className="text-xs text-green-600">✓ Correct_answer column found</p>
                      : <p className="text-xs text-amber-600">⚠ No Correct_answer column — gold answer will be empty</p>
                    }
                  </div>
                )}
              </div>
              <input ref={mcqFileRef} type="file" accept=".csv" className="hidden" onChange={handleMcqFile} />

              <Button className="w-full gap-2" onClick={handleMcqUpload} disabled={uploadDataset.isPending || !mcqCsvContent.trim()}>
                <Upload className="h-4 w-4" />
                {uploadDataset.isPending ? "Uploading..." : "Upload MCQ CSV"}
              </Button>
            </TabsContent>

            {/* ── Tab 3: MCQ Pair ───────────────────────────────────────── */}
            <TabsContent value="mcq-pair" className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">How it works:</p>
                <p>Upload two CSV files. The system matches them by the <strong>ID</strong> column and merges the correct answer from the answers file into the questions file.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Questions file (without answers) */}
                <div
                  className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${pairQFile ? 'border-green-400 bg-green-50' : 'border-border hover:border-primary/40 hover:bg-accent/30'}`}
                  onClick={() => pairQRef.current?.click()}
                >
                  <FileText className={`h-6 w-6 mx-auto mb-2 ${pairQFile ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <p className="text-xs font-semibold">{pairQFile ? pairQName : "Questions file"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pairQFile ? "✓ Loaded" : "without Correct_answer"}</p>
                </div>
                <input ref={pairQRef} type="file" accept=".csv" className="hidden" onChange={handlePairQFile} />

                {/* Answers file (with answers) */}
                <div
                  className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${pairAFile ? 'border-green-400 bg-green-50' : 'border-border hover:border-primary/40 hover:bg-accent/30'}`}
                  onClick={() => pairARef.current?.click()}
                >
                  <FileText className={`h-6 w-6 mx-auto mb-2 ${pairAFile ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <p className="text-xs font-semibold">{pairAFile ? pairAName : "Answers file"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pairAFile ? "✓ Loaded" : "with Correct_answer"}</p>
                </div>
                <input ref={pairARef} type="file" accept=".csv" className="hidden" onChange={handlePairAFile} />
              </div>

              {pairQFile && pairAFile && !pairPreview && (
                <Button variant="outline" className="w-full" onClick={buildPairPreview}>
                  Preview matching
                </Button>
              )}

              {pairPreview && (
                <div className="flex gap-3">
                  <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{pairPreview.matched}</p>
                    <p className="text-xs text-green-600">Questions matched</p>
                  </div>
                  <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{pairPreview.unmatched}</p>
                    <p className="text-xs text-amber-600">No answer found</p>
                  </div>
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handlePairUpload}
                disabled={uploadDataset.isPending || !pairQFile || !pairAFile}
              >
                <Upload className="h-4 w-4" />
                {uploadDataset.isPending ? "Merging and uploading..." : "Merge & Upload"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add single question */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add Single Question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid md:grid-cols-2 gap-4">
              <FormField control={form.control} name="questionType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={CreateQuestionBodyQuestionType.OPEN_ENDED}>Open Ended</SelectItem>
                      <SelectItem value={CreateQuestionBodyQuestionType.MCQ}>MCQ</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div /> {/* spacer */}
              <FormField control={form.control} name="questionText" render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-sm">Question</FormLabel>
                  <FormControl><Textarea placeholder="Enter the question..." className="min-h-[70px] resize-y" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="goldAnswer" render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-sm text-green-700">Gold Answer</FormLabel>
                  <FormControl><Textarea placeholder="The correct / reference answer..." className="min-h-[70px] resize-y border-green-300 focus-visible:ring-green-400" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={createQuestion.isPending} className="md:col-span-2">
                {createQuestion.isPending ? "Saving..." : "Add Question"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Questions table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Questions ({questions?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isQuestionsLoading ? (
            <div className="p-6"><Skeleton className="h-64 w-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 w-12">#</TableHead>
                  <TableHead className="w-20">Type</TableHead>
                  <TableHead className="w-[42%]">Question</TableHead>
                  <TableHead>Gold Answer</TableHead>
                  <TableHead className="text-right pr-4 w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions?.map((q) => (
                  <TableRow key={q.id} className="hover:bg-muted/40 align-top">
                    <TableCell className="pl-4 text-muted-foreground text-xs">{q.id}</TableCell>
                    <TableCell>
                      <Badge variant={q.questionType === "MCQ" ? "secondary" : "outline"} className="text-xs">
                        {q.questionType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm leading-relaxed line-clamp-3">{q.questionText}</TableCell>
                    <TableCell className="text-sm text-green-700 leading-relaxed line-clamp-3">{q.goldAnswer}</TableCell>
                    <TableCell className="text-right pr-4">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)} disabled={deleteQuestion.isPending}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!questions || questions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">
                      No questions yet. Upload a file or add manually above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
