import { useParams, Link } from "wouter";
import { useGetDataset, useListQuestions, useCreateQuestion, useDeleteQuestion, useUploadDataset, getGetDatasetQueryKey, getListQuestionsQueryKey, CreateQuestionBodyQuestionType, UploadDatasetBodyFormat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload, Database, ChevronLeft, FileCode, CheckSquare, AlignLeft } from "lucide-react";
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
        toast({ title: "Entry Appended", description: "Question recorded in database." });
      },
    });
  }

  function handleDelete(questionId: number) {
    if (confirm("Delete this question from the corpus?")) {
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
        toast({
          title: "Batch Ingestion Complete",
          description: `Imported: ${res.imported} | Skipped: ${res.skipped} | Errors: ${res.errors.length}`,
        });
      },
      onError: (err) => {
        toast({
          title: "Ingestion Fault",
          description: err.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    });
  }

  if (isDatasetLoading) return <Skeleton className="h-[500px] w-full rounded-none" />;
  if (!dataset) return <div className="text-center py-20 font-mono uppercase text-muted-foreground tracking-widest text-xs">Dataset Missing in DB</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="border-b border-border pb-6 flex flex-col gap-4">
        <Link href="/datasets" className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest hover:text-primary transition-colors flex items-center w-fit">
          <ChevronLeft className="h-3 w-3 mr-1" /> Return to Datasets
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground flex items-center gap-3">
              <Database className="h-6 w-6 text-primary" />
              {dataset.datasetName}
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant="outline" className="rounded-none font-mono text-[9px] uppercase tracking-widest bg-muted/20 text-muted-foreground border-border">
                {dataset.domain} Domain
              </Badge>
              <Badge variant="outline" className="rounded-none font-mono text-[9px] uppercase tracking-widest bg-primary/10 text-primary border-primary/20">
                n = {dataset.questionCount} Items
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <FileCode className="h-4 w-4" /> Single Entry Inject
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="questionText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Input Query</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Formulate clinical scenario..." className="min-h-24 rounded-none bg-background/50 font-mono text-sm resize-y" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="goldAnswer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase text-green-500">Ground Truth Answer</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Define acceptable target criteria..." className="min-h-24 rounded-none bg-background/50 font-mono text-sm border-green-500/30 focus-visible:ring-green-500/50 resize-y" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="questionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Question Modality</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-none bg-background/50 font-mono text-sm">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-none font-mono text-sm">
                          <SelectItem value={CreateQuestionBodyQuestionType.OPEN_ENDED}>Open Ended Generative</SelectItem>
                          <SelectItem value={CreateQuestionBodyQuestionType.MCQ}>Multiple Choice</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full rounded-none font-mono tracking-widest uppercase text-xs h-10" disabled={createQuestion.isPending}>
                  {createQuestion.isPending ? "Transmitting..." : "Append Entry"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm flex flex-col">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Upload className="h-4 w-4" /> Bulk Data Ingestion
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col flex-1 gap-5">
            <div className="space-y-3">
              <FormLabel className="text-[10px] font-mono tracking-widest uppercase block">Payload Format</FormLabel>
              <Select value={uploadFormat} onValueChange={(v: UploadDatasetBodyFormat) => setUploadFormat(v)}>
                <SelectTrigger className="rounded-none bg-background/50 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none font-mono text-sm">
                  <SelectItem value={UploadDatasetBodyFormat.jsonl}>JSON Lines (.jsonl)</SelectItem>
                  <SelectItem value={UploadDatasetBodyFormat.csv}>CSV Dump (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 flex-1 flex flex-col">
              <FormLabel className="text-[10px] font-mono tracking-widest uppercase flex items-center justify-between">
                <span>Raw Content</span>
                <span className="text-muted-foreground/50 lowercase">
                  {uploadFormat === 'csv' ? 'questionText,goldAnswer,questionType' : '{"questionText": "...", "goldAnswer": "..."}'}
                </span>
              </FormLabel>
              <Textarea 
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder="Paste payload dump here..."
                className="flex-1 min-h-[200px] rounded-none bg-background/50 font-mono text-xs whitespace-pre resize-none"
              />
            </div>
            <Button onClick={handleUpload} disabled={uploadDataset.isPending || !uploadContent.trim()} variant="secondary" className="w-full rounded-none font-mono tracking-widest uppercase text-xs h-10 mt-auto">
              <Upload className="mr-2 h-4 w-4" />
              {uploadDataset.isPending ? "Processing Payload..." : "Execute Bulk Inject"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0">
          {isQuestionsLoading ? (
            <div className="p-6"><Skeleton className="h-[400px] w-full rounded-none" /></div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-16">QID</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-24">Type</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-[40%]">Input Prompt</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Target Criteria</TableHead>
                  <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-16 text-right">Cmd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions?.map((q) => (
                  <TableRow key={q.id} className="border-border/30 hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-muted-foreground">{String(q.id).padStart(5, '0')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-none font-mono text-[9px] border-border text-muted-foreground flex items-center justify-center gap-1 w-fit">
                        {q.questionType === 'MCQ' ? <CheckSquare className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
                        {q.questionType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono leading-relaxed opacity-90 line-clamp-3">{q.questionText}</TableCell>
                    <TableCell className="text-sm font-mono leading-relaxed text-green-500/80 line-clamp-3">{q.goldAnswer}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(q.id)}
                        disabled={deleteQuestion.isPending}
                        className="h-8 w-8 rounded-none text-destructive hover:bg-destructive/20 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!questions || questions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      Corpus empty. Waiting for records.
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