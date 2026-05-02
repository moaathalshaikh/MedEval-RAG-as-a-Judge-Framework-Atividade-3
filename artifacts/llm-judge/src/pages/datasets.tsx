import { useListDatasets, useCreateDataset, useDeleteDataset, getListDatasetsQueryKey, CreateDatasetBodyDomain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Database } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

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
    defaultValues: {
      datasetName: "",
      domain: CreateDatasetBodyDomain.General,
    },
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
    if (confirm("Are you sure you want to delete this dataset? This will also delete related questions and responses.")) {
      deleteDataset.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
        },
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Datasets</h2>
        <p className="text-muted-foreground">Manage evaluation datasets and benchmarks.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Create Dataset</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="datasetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dataset Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MedQA subset" {...field} />
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
                      <FormLabel>Domain</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select domain" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CreateDatasetBodyDomain.General}>General</SelectItem>
                          <SelectItem value={CreateDatasetBodyDomain.Medical}>Medical</SelectItem>
                          <SelectItem value={CreateDatasetBodyDomain.Legal}>Legal</SelectItem>
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

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>All Datasets</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets?.map((dataset) => (
                    <TableRow key={dataset.id}>
                      <TableCell className="font-mono text-xs">{dataset.id}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/datasets/${dataset.id}`} className="hover:underline flex items-center gap-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          {dataset.datasetName}
                        </Link>
                      </TableCell>
                      <TableCell>{dataset.domain}</TableCell>
                      <TableCell className="font-mono">{dataset.questionCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(dataset.id)}
                          disabled={deleteDataset.isPending}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!datasets || datasets.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No datasets found. Create one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}