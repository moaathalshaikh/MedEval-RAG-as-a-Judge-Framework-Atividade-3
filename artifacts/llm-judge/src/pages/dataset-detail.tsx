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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, ChevronLeft, Plus, Upload, FileJson, FileText, CheckCircle2, X } from "lucide-react";
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

// ─── CSV parser (handles quoted fields with commas) ───────────────────────────
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
  if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };
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

// ─── File drop zone component ─────────────────────────────────────────────────
function FileDropZone({
  label, hint, accept, fileName, onFile, onClear,
}: {
  label: string; hint: string; accept: string;
  fileName?: string; onFile: (text: string, name: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    onFile(await file.text(), file.name);
    e.target.value = "";
  }
  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
        ${fileName ? "border-green-400 bg-green-50" : "border-border hover:border-primary/50 hover:bg-accent/30"}`}
      onClick={() => !fileName && ref.current?.click()}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={handleChange} />
      {fileName ? (
        <>
          <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
          <p className="text-sm font-semibold text-green-700">{fileName}</p>
          <p className="text-xs text-green-600 mt-0.5">File loaded</p>
          <button
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-green-200 text-green-600"
            onClick={e => { e.stopPropagation(); onClear(); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </>
      )}
    </div>
  );
}

export default function DatasetDetail() {
  const { id } = useParams();
  const datasetId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dataset, isLoading: isDatasetLoading } = useGetDataset(datasetId, {
    query: { enabled: !!datasetId, queryKey: getGetDatasetQueryKey(datasetId) }
  });
  const { data: questions, isLoading: isQuestionsLoading } = useListQuestions({ datasetId }, {
    query: { enabled: !!datasetId, queryKey: getListQuestionsQueryKey({ datasetId }) }
  });

  const createQuestion = useCreateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const uploadDataset = useUploadDataset();

  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
    queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
  }

  function doUpload(content: string, format: UploadDatasetBodyFormat, successMsg: string) {
    setUploadResult(null);
    uploadDataset.mutate({ data: { datasetId, content, format } }, {
      onSuccess: (res) => {
        invalidate(); setUploadResult(res);
        toast({ title: successMsg, description: `${res.imported} questions imported` });
      },
      onError: (err) => toast({ title: "Upload failed", description: (err as any).error || "Error", variant: "destructive" }),
    });
  }

  // ── Single question form ──────────────────────────────────────────────────
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { questionText: "", goldAnswer: "", questionType: CreateQuestionBodyQuestionType.OPEN_ENDED },
  });

  function onSubmit(data: QuestionFormValues) {
    createQuestion.mutate({ data: { ...data, datasetId } }, {
      onSuccess: () => { invalidate(); form.reset(); toast({ title: "Question added" }); },
    });
  }

  function handleDelete(questionId: number) {
    if (!confirm("Delete this question?")) return;
    deleteQuestion.mutate({ id: questionId }, { onSuccess: invalidate });
  }

  // ── Tab 1: JSONL (open-ended) ─────────────────────────────────────────────
  const [jsonlText, setJsonlText] = useState("");
  const [jsonlName, setJsonlName] = useState("");

  // ── Tab 2: MCQ CSV (1 or 2 files) ────────────────────────────────────────
  const [mcqMain, setMcqMain] = useState<string | null>(null);    // questions (may have answers)
  const [mcqMainName, setMcqMainName] = useState("");
  const [mcqAnswers, setMcqAnswers] = useState<string | null>(null); // optional answers file
  const [mcqAnswersName, setMcqAnswersName] = useState("");

  // Derived: does the main file already have Correct_answer?
  const mcqMainHasAnswers = mcqMain
    ? parseCSV(mcqMain).headers.includes("Correct_answer")
    : null;

  // Preview matching when both files loaded
  const [matchPreview, setMatchPreview] = useState<{ matched: number; unmatched: number } | null>(null);

  function buildMatchPreview() {
    if (!mcqMain || !mcqAnswers) return;
    const qRows = parseCSV(mcqMain).rows;
    const aMap = new Map(parseCSV(mcqAnswers).rows.map(r => [r["ID"]?.trim(), r]));
    const matched = qRows.filter(r => aMap.has(r["ID"]?.trim())).length;
    setMatchPreview({ matched, unmatched: qRows.length - matched });
  }

  function buildMCQJsonl(qText: string, aText: string | null): string {
    const { rows: qRows } = parseCSV(qText);
    const aMap = aText
      ? new Map(parseCSV(aText).rows.map(r => [r["ID"]?.trim(), r]))
      : null;

    return qRows.map(row => {
      const questionText = row["Question_text"] ?? "";
      if (!questionText) return null;
      const choices: Record<string, string> = {};
      ["A","B","C","D","E","F"].forEach(l => { const v = row[`(${l})`]; if (v) choices[l] = v; });

      // Get correct answer: from main file's own column or from answers file
      const answerSrc = aMap ? aMap.get(row["ID"]?.trim()) : row;
      let goldAnswer = "(no answer provided)";
      if (answerSrc?.["Correct_answer"]) {
        const letter = extractCorrectLetter(answerSrc["Correct_answer"]);
        goldAnswer = letter && choices[letter]
          ? `(${letter}) ${choices[letter]}`
          : answerSrc["Correct_answer"];
      }

      return JSON.stringify({
        questionText, goldAnswer, questionType: "MCQ",
        metadata: { choices, question_name: row["Question_name"] ?? "", external_id: row["ID"] ?? "" },
      });
    }).filter(Boolean).join("\n");
  }

  function handleMCQUpload() {
    if (!mcqMain) return;
    const content = buildMCQJsonl(mcqMain, mcqAnswers);
    doUpload(content, UploadDatasetBodyFormat.jsonl, "MCQ upload complete");
    setMcqMain(null); setMcqMainName("");
    setMcqAnswers(null); setMcqAnswersName(""); setMatchPreview(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
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

      {/* Upload result */}
      {uploadResult && (
        <Alert className={uploadResult.errors.length > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <span className="font-semibold text-green-700">{uploadResult.imported} questions imported</span>
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

      {/* Bulk Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Bulk Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="jsonl">
            <TabsList className="grid grid-cols-2 w-full mb-5">
              <TabsTrigger value="jsonl" className="gap-1.5 text-xs">
                <FileJson className="h-3.5 w-3.5" /> Open-ended (.jsonl)
              </TabsTrigger>
              <TabsTrigger value="mcq" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> MCQ (.csv)
              </TabsTrigger>
            </TabsList>

            {/* ── JSONL tab ─────────────────────────────────────────────── */}
            <TabsContent value="jsonl" className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono border">
                <p className="font-semibold text-foreground not-italic mb-1">Expected format (one JSON per line):</p>
                <p className="text-green-700">{"{"}"Question": "...", "Free_form_answer": "..."{"}"}</p>
                <p className="text-muted-foreground mt-0.5">Also accepted: <span className="text-blue-600">questionText / goldAnswer</span></p>
              </div>

              <FileDropZone
                label="Drop .jsonl file or click to browse"
                hint=".jsonl · one JSON object per line"
                accept=".jsonl,.json"
                fileName={jsonlName}
                onFile={(text, name) => { setJsonlText(text); setJsonlName(name); }}
                onClear={() => { setJsonlText(""); setJsonlName(""); }}
              />

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Or paste directly:</p>
                <Textarea
                  value={jsonlText}
                  onChange={e => setJsonlText(e.target.value)}
                  placeholder={'{"Question": "...", "Free_form_answer": "..."}'}
                  className="font-mono text-xs h-24 resize-none"
                />
              </div>

              <Button className="w-full gap-2"
                onClick={() => doUpload(jsonlText, UploadDatasetBodyFormat.jsonl, "Upload complete")}
                disabled={uploadDataset.isPending || !jsonlText.trim()}
              >
                <Upload className="h-4 w-4" />
                {uploadDataset.isPending ? "Uploading..." : "Upload JSONL"}
              </Button>
            </TabsContent>

            {/* ── MCQ tab ───────────────────────────────────────────────── */}
            <TabsContent value="mcq" className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono border">
                <p className="font-semibold text-foreground not-italic mb-1">Expected columns:</p>
                <p className="text-primary">ID, Question_name, Question_text, (A), (B), (C), (D), (E), (F)</p>
                <p className="text-green-700 mt-0.5">+ Correct_answer &nbsp;<span className="text-muted-foreground font-sans italic">(optional — can be in a separate file)</span></p>
              </div>

              {/* Main questions file */}
              <FileDropZone
                label="Questions file (.csv)"
                hint="With or without Correct_answer column"
                accept=".csv"
                fileName={mcqMainName}
                onFile={(text, name) => { setMcqMain(text); setMcqMainName(name); setMatchPreview(null); }}
                onClear={() => { setMcqMain(null); setMcqMainName(""); setMatchPreview(null); }}
              />

              {/* Show status after main file loaded */}
              {mcqMain && mcqMainHasAnswers === true && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Correct_answer column detected — ready to upload
                </p>
              )}

              {mcqMain && mcqMainHasAnswers === false && (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600">No Correct_answer column — upload an answers file to match by ID:</p>
                  <FileDropZone
                    label="Answers file (.csv)"
                    hint="Must have ID + Correct_answer columns"
                    accept=".csv"
                    fileName={mcqAnswersName}
                    onFile={(text, name) => { setMcqAnswers(text); setMcqAnswersName(name); setMatchPreview(null); }}
                    onClear={() => { setMcqAnswers(null); setMcqAnswersName(""); setMatchPreview(null); }}
                  />

                  {mcqAnswers && !matchPreview && (
                    <Button variant="outline" size="sm" className="w-full" onClick={buildMatchPreview}>
                      Preview matching
                    </Button>
                  )}

                  {matchPreview && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-green-700">{matchPreview.matched}</p>
                        <p className="text-xs text-green-600">Questions matched</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-amber-700">{matchPreview.unmatched}</p>
                        <p className="text-xs text-amber-600">No answer found</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleMCQUpload}
                disabled={uploadDataset.isPending || !mcqMain || (mcqMainHasAnswers === false && !mcqAnswers)}
              >
                <Upload className="h-4 w-4" />
                {uploadDataset.isPending ? "Uploading..." : "Upload MCQ"}
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
              <div />
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
