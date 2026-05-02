import { useListDatasets, useCreateDataset, useDeleteDataset, getListDatasetsQueryKey, CreateDatasetBodyDomain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Database, ChevronRight, PlusSquare } from "lucide-react";
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
    defaultValues: {
      datasetName: "",
      domain: CreateDatasetBodyDomain.Medical,
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
    if (confirm("Purge dataset and all associated question telemetry?")) {
      deleteDataset.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDatasetsQueryKey() });
        },
      });
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
          <Database className="h-6 w-6 text-primary" />
          Benchmark Datasets
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Corpus Management & Ground Truth Data</p>
      </div>

      <div className="grid gap-8 md:grid-cols-12 align-top">
        <Card className="md:col-span-4 h-fit rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <PlusSquare className="h-4 w-4" /> Initialize Corpus
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="datasetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Corpus Designation</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MedQA subset" className="rounded-none bg-background/50 font-mono text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Domain Spec</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-none bg-background/50 font-mono text-sm">
                            <SelectValue placeholder="Select domain" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-none font-mono text-sm">
                          <SelectItem value={CreateDatasetBodyDomain.Medical}>Clinical / Medical</SelectItem>
                          <SelectItem value={CreateDatasetBodyDomain.General}>General Instruction</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full rounded-none font-mono tracking-widest uppercase text-xs h-10" disabled={createDataset.isPending}>
                  {createDataset.isPending ? "Allocating..." : "Create Corpus"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="md:col-span-8 rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6"><Skeleton className="h-[400px] w-full rounded-none" /></div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 w-16">ID</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Dataset</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Domain</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 text-right">Items</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets?.map((dataset) => (
                    <TableRow key={dataset.id} className="border-border/30 hover:bg-muted/20 group">
                      <TableCell className="font-mono text-xs text-muted-foreground">{String(dataset.id).padStart(4, '0')}</TableCell>
                      <TableCell>
                        <Link href={`/datasets/${dataset.id}`} className="inline-flex items-center gap-2 group-hover:text-primary transition-colors">
                          <span className="font-semibold text-sm">{dataset.datasetName}</span>
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-none font-mono text-[9px] uppercase tracking-widest bg-muted/20 text-muted-foreground border-border">
                          {dataset.domain}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right">{dataset.questionCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(dataset.id)}
                          disabled={deleteDataset.isPending}
                          className="h-8 w-8 rounded-none text-destructive hover:bg-destructive/20 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!datasets || datasets.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        No datasets allocated.
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