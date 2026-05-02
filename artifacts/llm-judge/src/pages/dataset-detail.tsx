import { useParams, Link } from "wouter";
import { useGetDataset, useListQuestions, useCreateQuestion, useDeleteQuestion, useUploadDataset, getGetDatasetQueryKey, getListQuestionsQueryKey, CreateQuestionBodyQuestionType, UploadDatasetBodyFormat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload, ChevronLeft, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const questionSchema = z.object({
  questionText: z.string().min(1, "Question text is required"),
  goldAnswer: z.string().min(1, "Gold answer is required"),
  questionType: z.nativeEnum(CreateQuestionBodyQuestionType),
});

type QuestionFormValues = z.infer<typeof questionSchema>;

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

  const [uploadFormat, setUploadFormat] = useState<UploadDatasetBodyFormat>(UploadDatasetBodyFormat.jsonl);
  const [uploadContent, setUploadContent] = useState("");

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      questionText: "",
      goldAnswer: "",
      questionType: CreateQuestionBodyQuestionType.OPEN_ENDED,
    },
  });

  function onSubmit(data: QuestionFormValues) {
    createQuestion.mutate({ data: { ...data, datasetId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
        queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        form.reset();
        toast({ title: "Question added", description: "Question saved to dataset." });
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

  function handleUpload() {
    if (!uploadContent.trim()) return;
    uploadDataset.mutate({ data: { datasetId, content: uploadContent, format: uploadFormat } }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey({ datasetId }) });
        queryClient.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
        setUploadContent("");
        toast({ title: "Bulk upload complete", description: `Imported: ${res.imported}, Skipped: ${res.skipped}` });
      },
      onError: (err) => {
        toast({ title: "Upload failed", description: err.error || "Unknown error", variant: "destructive" });
      }
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{dataset.datasetName}</h1>
          <Badge variant="secondary">{dataset.domain}</Badge>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">{dataset.questionCount} questions</Badge>
        </div>
      </div>

      {/* Add / Bulk upload */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Add Question
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="questionText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Question</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter the clinical question..." className="min-h-[80px] resize-y" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="goldAnswer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-green-700">Gold Answer</FormLabel>
                      <FormControl>
                        <Textarea placeholder="The correct / reference answer..." className="min-h-[80px] resize-y border-green-300 focus-visible:ring-green-400" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="questionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Question Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CreateQuestionBodyQuestionType.OPEN_ENDED}>Open Ended</SelectItem>
                          <SelectItem value={CreateQuestionBodyQuestionType.MCQ}>Multiple Choice (MCQ)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createQuestion.isPending}>
                  {createQuestion.isPending ? "Saving..." : "Add Question"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Bulk Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Format</label>
              <Select value={uploadFormat} onValueChange={(v: UploadDatasetBodyFormat) => setUploadFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UploadDatasetBodyFormat.jsonl}>JSON Lines (.jsonl)</SelectItem>
                  <SelectItem value={UploadDatasetBodyFormat.csv}>CSV (.csv)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground font-mono">
                {uploadFormat === 'csv' ? 'questionText,goldAnswer,questionType' : '{"questionText":"...","goldAnswer":"...","questionType":"OPEN_ENDED"}'}
              </p>
            </div>
            <Textarea
              value={uploadContent}
              onChange={(e) => setUploadContent(e.target.value)}
              placeholder="Paste your data here..."
              className="flex-1 min-h-[160px] font-mono text-xs resize-none"
            />
            <Button onClick={handleUpload} disabled={uploadDataset.isPending || !uploadContent.trim()} variant="secondary" className="w-full gap-2">
              <Upload className="h-4 w-4" />
              {uploadDataset.isPending ? "Uploading..." : "Upload"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Questions Table */}
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
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-[40%]">Question</TableHead>
                  <TableHead>Gold Answer</TableHead>
                  <TableHead className="text-right pr-4 w-14"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions?.map((q) => (
                  <TableRow key={q.id} className="hover:bg-muted/40 align-top">
                    <TableCell className="pl-4 text-muted-foreground text-xs">{q.id}</TableCell>
                    <TableCell>
                      <Badge variant={q.questionType === 'MCQ' ? 'secondary' : 'outline'} className="text-xs">
                        {q.questionType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm leading-relaxed line-clamp-3">{q.questionText}</TableCell>
                    <TableCell className="text-sm text-green-700 leading-relaxed line-clamp-3">{q.goldAnswer}</TableCell>
                    <TableCell className="text-right pr-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(q.id)}
                        disabled={deleteQuestion.isPending}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!questions || questions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">
                      No questions yet. Add your first question above.
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
