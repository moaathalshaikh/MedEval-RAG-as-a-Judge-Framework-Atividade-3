import { useParams } from "wouter";
import { useGetDataset, useListQuestions, useCreateQuestion, useDeleteQuestion, useUploadDataset, getGetDatasetQueryKey, getListQuestionsQueryKey, CreateQuestionBodyQuestionType, UploadDatasetBodyFormat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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
        toast({ title: "Question added successfully" });
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
        toast({
          title: "Upload Complete",
          description: `Imported: ${res.imported}, Skipped: ${res.skipped}, Errors: ${res.errors.length}`,
        });
      },
      onError: (err) => {
        toast({
          title: "Upload Failed",
          description: err.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    });
  }

  if (isDatasetLoading) return <Skeleton className="h-[500px] w-full" />;
  if (!dataset) return <div>Dataset not found</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{dataset.datasetName}</h2>
        <div className="flex gap-2 mt-2">
          <Badge variant="secondary">{dataset.domain}</Badge>
          <Badge variant="outline">{dataset.questionCount} Questions</Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Single Question</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="questionText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question</FormLabel>
                      <FormControl>
                        <Textarea placeholder="What is the..." className="h-20" {...field} />
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
                      <FormLabel>Gold Answer (Ground Truth)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="The correct answer is..." className="h-20" {...field} />
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
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CreateQuestionBodyQuestionType.OPEN_ENDED}>Open Ended</SelectItem>
                          <SelectItem value={CreateQuestionBodyQuestionType.MCQ}>Multiple Choice</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createQuestion.isPending}>
                  {createQuestion.isPending ? "Adding..." : "Add Question"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk Upload</CardTitle>
            <CardDescription>Paste JSONL or CSV data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={uploadFormat} onValueChange={(v: UploadDatasetBodyFormat) => setUploadFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UploadDatasetBodyFormat.jsonl}>JSONL</SelectItem>
                  <SelectItem value={UploadDatasetBodyFormat.csv}>CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data Content</Label>
              <Textarea 
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder={uploadFormat === 'csv' ? "questionText,goldAnswer,questionType\n..." : '{"questionText": "...", "goldAnswer": "...", "questionType": "OPEN_ENDED"}\n...'}
                className="h-[180px] font-mono text-xs"
              />
            </div>
            <Button onClick={handleUpload} disabled={uploadDataset.isPending || !uploadContent.trim()} className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              {uploadDataset.isPending ? "Uploading..." : "Upload Data"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Questions in Dataset</CardTitle>
        </CardHeader>
        <CardContent>
          {isQuestionsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-1/2">Question</TableHead>
                  <TableHead>Gold Answer</TableHead>
                  <TableHead className="text-right w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions?.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">{q.id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{q.questionType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm line-clamp-2">{q.questionText}</TableCell>
                    <TableCell className="text-sm text-muted-foreground line-clamp-2">{q.goldAnswer}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(q.id)}
                        disabled={deleteQuestion.isPending}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!questions || questions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No questions found in this dataset.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}