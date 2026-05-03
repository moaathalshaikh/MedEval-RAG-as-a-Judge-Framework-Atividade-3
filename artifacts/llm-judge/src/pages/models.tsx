import { useListModels, useCreateModel, useDeleteModel, getListModelsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useState } from "react";
import { currentUnifiedUser } from "@/components/auth-gate";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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
  const currentUserId = currentUnifiedUser?.id ?? null;
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

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

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteModel.mutate({ id: deleteTarget.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
        setDeleteTarget(null);
      },
    });
  }

  return (
    <>
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
                    <TableHead>Created By</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models?.map((model) => (
                    <TableRow key={model.id} className="hover:bg-muted/40">
                      <TableCell className="pl-4 text-muted-foreground text-xs">{model.id}</TableCell>
                      <TableCell>
                        <div className="font-medium">{model.modelName}</div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
                          {model.modelSize}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{model.notes || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {model.createdByName ?? <span className="text-muted-foreground/40 italic">Unknown</span>}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <TooltipProvider>
                          {currentUserId && model.createdById === currentUserId ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget({ id: model.id, name: model.modelName })}
                              disabled={deleteModel.isPending}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/40 cursor-not-allowed">
                                  <Lock className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>Only the owner can delete this model</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!models || models.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-16 text-sm text-muted-foreground">
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

    <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" /> Delete Model
          </DialogTitle>
          <DialogDescription className="pt-2">
            Are you sure you want to delete <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteModel.isPending}
            onClick={confirmDelete}
          >
            {deleteModel.isPending ? "Deleting…" : "Yes, delete model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
