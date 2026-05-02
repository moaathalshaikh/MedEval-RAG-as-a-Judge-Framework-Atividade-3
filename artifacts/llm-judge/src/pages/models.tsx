import { useListModels, useCreateModel, useDeleteModel, getListModelsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const modelSchema = z.object({
  modelName: z.string().min(1, "Model name is required"),
  modelSize: z.string().min(1, "Model size is required"),
  notes: z.string().optional(),
});

type ModelFormValues = z.infer<typeof modelSchema>;

export default function Models() {
  const { data: models, isLoading } = useListModels();
  const createModel = useCreateModel();
  const deleteModel = useDeleteModel();
  const queryClient = useQueryClient();

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: { modelName: "", modelSize: "", notes: "" },
  });

  function onSubmit(data: ModelFormValues) {
    createModel.mutate(
      { data: { modelName: data.modelName, modelSize: data.modelSize, notes: data.notes || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
          form.reset();
        },
      }
    );
  }

  function handleDelete(id: number) {
    if (confirm("Delete this model?")) {
      deleteModel.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() }),
      });
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">SLM Models</h1>
        <p className="text-sm text-muted-foreground mt-1">Register the small language models you want to benchmark</p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Form */}
        <Card className="md:col-span-4 h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Add New Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="modelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Model Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. med-llama-3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="modelSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Model Size</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 7B, 13B, 70B" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        Notes <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. fine-tuned on MedQA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createModel.isPending}>
                  {createModel.isPending ? "Saving..." : "Register Model"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="md:col-span-8">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6"><Skeleton className="h-64 w-full" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-4">#</TableHead>
                    <TableHead>Model Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models?.map((model) => (
                    <TableRow key={model.id} className="hover:bg-muted/40">
                      <TableCell className="pl-4 text-muted-foreground text-xs">{model.id}</TableCell>
                      <TableCell className="font-medium">{model.modelName}</TableCell>
                      <TableCell>
                        <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
                          {model.modelSize}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{model.notes || "—"}</TableCell>
                      <TableCell className="text-right pr-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(model.id)}
                          disabled={deleteModel.isPending}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!models || models.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">
                        No models registered yet. Add your first model.
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
