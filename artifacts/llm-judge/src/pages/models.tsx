import { useListModels, useCreateModel, useDeleteModel, getListModelsQueryKey, CreateModelBodyProvider } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Server, PlusSquare } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const modelSchema = z.object({
  modelName: z.string().min(1, "Model name is required"),
  provider: z.nativeEnum(CreateModelBodyProvider),
  version: z.string().min(1, "Version is required"),
  precisionParam: z.string().optional(),
});

type ModelFormValues = z.infer<typeof modelSchema>;

export default function Models() {
  const { data: models, isLoading } = useListModels();
  const createModel = useCreateModel();
  const deleteModel = useDeleteModel();
  const queryClient = useQueryClient();

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: {
      modelName: "",
      provider: CreateModelBodyProvider.OpenAI,
      version: "",
      precisionParam: "",
    },
  });

  function onSubmit(data: ModelFormValues) {
    createModel.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
        form.reset();
      },
    });
  }

  function handleDelete(id: number) {
    if (confirm("Execute deletion protocol for this model entry?")) {
      deleteModel.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
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
          <Server className="h-6 w-6 text-primary" />
          SLM Registry
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Subject Under Test Configurations</p>
      </div>

      <div className="grid gap-8 md:grid-cols-12 align-top">
        <Card className="md:col-span-4 h-fit rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <PlusSquare className="h-4 w-4" /> Append Registry Entry
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="modelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Model Identifier</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. med-llama-3" className="rounded-none bg-background/50 font-mono text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Provider</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-none bg-background/50 font-mono text-sm">
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-none font-mono text-sm">
                          <SelectItem value={CreateModelBodyProvider.OpenAI}>OpenAI</SelectItem>
                          <SelectItem value={CreateModelBodyProvider.DeepSeek}>DeepSeek</SelectItem>
                          <SelectItem value={CreateModelBodyProvider.Claude}>Claude</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Version Tag</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. v2.1.0-hf" className="rounded-none bg-background/50 font-mono text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="precisionParam"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-mono tracking-widest uppercase">Precision (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. fp16, int8" className="rounded-none bg-background/50 font-mono text-sm" {...field} />
                      </FormControl>
                      <FormMessage className="text-[10px] font-mono" />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full rounded-none font-mono tracking-widest uppercase text-xs h-10" disabled={createModel.isPending}>
                  {createModel.isPending ? "Persisting..." : "Register Model"}
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
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Model</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Provider</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Version</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12">Precision</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models?.map((model) => (
                    <TableRow key={model.id} className="border-border/30 hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">{String(model.id).padStart(4, '0')}</TableCell>
                      <TableCell className="font-semibold text-sm">{model.modelName}</TableCell>
                      <TableCell className="text-sm">{model.provider}</TableCell>
                      <TableCell className="font-mono text-xs">{model.version}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{model.precisionParam || "FP32"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(model.id)}
                          disabled={deleteModel.isPending}
                          className="h-8 w-8 rounded-none text-destructive hover:bg-destructive/20 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!models || models.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-16 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Registry empty. Awaiting configuration.
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