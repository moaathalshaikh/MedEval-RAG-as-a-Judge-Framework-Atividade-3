import {
  useGetApiKeyStatus,
  useSaveApiKeys,
  getGetApiKeyStatusQueryKey,
  useListModels,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

const keysSchema = z.object({
  openaiKey: z.string().optional(),
  deepseekKey: z.string().optional(),
  claudeKey: z.string().optional(),
});

type KeysFormValues = z.infer<typeof keysSchema>;

interface JudgeModelStatus {
  modelId: number | null;
  modelName: string | null;
  provider: string | null;
  version: string | null;
}

function useJudgeModel() {
  return useQuery<JudgeModelStatus>({
    queryKey: ["settings", "judge-model"],
    queryFn: () => fetch("/api/settings/judge-model").then((r) => r.json()),
  });
}

function useSetJudgeModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modelId: number) =>
      fetch("/api/settings/judge-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "judge-model"] });
    },
  });
}

export default function Settings() {
  const { data: status, isLoading } = useGetApiKeyStatus();
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const { data: models, isLoading: isLoadingModels } = useListModels();
  const saveKeys = useSaveApiKeys();
  const setJudgeModel = useSetJudgeModel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<KeysFormValues>({
    resolver: zodResolver(keysSchema),
    defaultValues: { openaiKey: "", deepseekKey: "", claudeKey: "" },
  });

  function onSubmit(data: KeysFormValues) {
    saveKeys.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiKeyStatusQueryKey() });
        form.reset();
        toast({ title: "API keys saved", description: "Provider credentials updated successfully." });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: err.error || "An error occurred", variant: "destructive" });
      },
    });
  }

  function handleSetJudge(modelId: string) {
    setJudgeModel.mutate(parseInt(modelId), {
      onSuccess: (data) => {
        toast({ title: "Judge model updated", description: `Now using ${data.modelName} as the judge.` });
      },
      onError: () => {
        toast({ title: "Failed to update", description: "Could not save judge model selection.", variant: "destructive" });
      },
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="max-w-2xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your judge model and API credentials</p>
      </div>

      {/* Judge Model */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Judge Model</CardTitle>
          <p className="text-xs text-muted-foreground">The LLM responsible for evaluating all model responses</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingJudge || isLoadingModels ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              {judgeModel?.modelId && (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="font-semibold text-green-800">{judgeModel.modelName}</p>
                    <p className="text-xs text-green-600 mt-0.5">{judgeModel.provider} · {judgeModel.version}</p>
                  </div>
                  <span className="text-xs font-medium bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">Active</span>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">{judgeModel?.modelId ? "Change judge model" : "Select judge model"}</label>
                <Select onValueChange={handleSetJudge} disabled={setJudgeModel.isPending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models?.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.modelName} <span className="text-muted-foreground ml-2 text-xs">{m.provider}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!models || models.length === 0) && (
                  <p className="text-xs text-muted-foreground">No models registered. <a href="/models" className="underline text-primary">Add a model first.</a></p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">API Keys</CardTitle>
          <p className="text-xs text-muted-foreground">Required for the judge model to call inference APIs</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {[
                  { name: "openaiKey" as const, label: "OpenAI", placeholder: "sk-...", statusKey: "openai" as const },
                  { name: "deepseekKey" as const, label: "DeepSeek", placeholder: "sk-...", statusKey: "deepseek" as const },
                  { name: "claudeKey" as const, label: "Anthropic (Claude)", placeholder: "sk-ant-...", statusKey: "claude" as const },
                ].map(({ name, label, placeholder, statusKey }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between mb-1.5">
                          <FormLabel className="text-sm font-medium">{label}</FormLabel>
                          {status?.[statusKey] ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <Check className="h-3 w-3" /> Configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                              <X className="h-3 w-3" /> Not set
                            </span>
                          )}
                        </div>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={status?.[statusKey] ? "••••••••••••••••••••" : placeholder}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button type="submit" disabled={saveKeys.isPending} className="w-full mt-2">
                  {saveKeys.isPending ? "Saving..." : "Save API Keys"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
