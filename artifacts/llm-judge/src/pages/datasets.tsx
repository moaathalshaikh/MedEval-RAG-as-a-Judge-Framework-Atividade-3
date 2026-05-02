import { useListDatasets, useCreateDataset, useDeleteDataset, getListDatasetsQueryKey, CreateDatasetBodyDomain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ChevronRight, Plus, ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const datasetSchema = z.object({
  datasetName: z.string().min(1, "Dataset name is required"),
  domain: z.nativeEnum(CreateDatasetBodyDomain),
});

type DatasetFormValues = z.infer<typeof datasetSchema>;

export default function Datasets() {
  const { data: datasets, isLoading } = useListDatasets();
  const createDataset = useCreateDataset();
  const deleteDataset = useDeleteDataset();
  const queryClient = useQueryClient();

  const form = useForm<DatasetFormValues>({
    resolver: zodResolver(datasetSchema),
    defaultValues: { datasetName: "", domain: CreateDatasetBodyDomain.Medical },
  });

  function onSubmit(data: DatasetFormValues) {
    createDataset.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
        form.reset();
      },
    });
  }

  function handleDelete(id: number) {
    if (confirm("Delete this dataset and all its questions?")) {
      deleteDataset.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() }),
      });
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Datasets</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage question datasets and ground truth answers</p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-4 h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Create Dataset
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="datasetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Dataset Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MedQA Subset" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Domain</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select domain" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CreateDatasetBodyDomain.Medical}>Medical</SelectItem>
                          <SelectItem value={CreateDatasetBodyDomain.General}>General</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createDataset.isPending}>
                  {createDataset.isPending ? "Creating..." : "Create Dataset"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="md:col-span-8">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6"><Skeleton className="h-64 w-full" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets?.map((dataset) => (
                    <TableRow key={dataset.id} className="hover:bg-muted/40 group">
                      <TableCell className="pl-4 text-muted-foreground text-xs">{dataset.id}</TableCell>
                      <TableCell className="font-medium">{dataset.datasetName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {dataset.domain}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{dataset.questionCount}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/datasets/${dataset.id}`}>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-primary border-primary/30 hover:bg-primary/5">
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(dataset.id)}
                            disabled={deleteDataset.isPending}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!datasets || datasets.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">
                        No datasets yet. Create your first dataset.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
