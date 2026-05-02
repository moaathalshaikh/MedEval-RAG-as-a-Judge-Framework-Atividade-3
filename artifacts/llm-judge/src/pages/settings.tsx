import {
  useGetApiKeyStatus,
  useSaveApiKeys,
  getGetApiKeyStatusQueryKey,
  useListModels,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
        toast({ title: "API Keys Saved", description: "Provider credentials updated." });
      },
      onError: (err) => {
        toast({ title: "Error saving keys", description: err.error || "Unknown error", variant: "destructive" });
      },
    });
  }

  function handleSetJudge(modelId: string) {
    setJudgeModel.mutate(parseInt(modelId), {
      onSuccess: (data) => {
        toast({ title: "Judge Model Set", description: `${data.modelName} is now the active judge.` });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to set judge model.", variant: "destructive" });
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Configure the judge model and API credentials.</p>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" />
            Judge Model
          </CardTitle>
          <CardDescription>
            Select one LLM that will act as the judge for all SLM evaluations. The judge must have its API key configured below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingJudge || isLoadingModels ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              {judgeModel?.modelId && (
                <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 mb-4">
                  <div>
                    <div className="font-semibold">{judgeModel.modelName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{judgeModel.version} · {judgeModel.provider}</div>
                  </div>
                  <Badge className="bg-primary text-primary-foreground">Active Judge</Badge>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {judgeModel?.modelId ? "Change Judge Model" : "Select Judge Model"}
                </label>
                <Select
                  onValueChange={handleSetJudge}
                  disabled={setJudgeModel.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a model as the judge..." />
                  </SelectTrigger>
                  <SelectContent>
                    {models?.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.modelName} ({m.provider} · {m.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Register models in the Models page first. Typically use a large, capable LLM (GPT-4, Claude, etc.) as the judge.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider API Keys</CardTitle>
          <CardDescription>
            API keys are required to run the judge pipeline. Keys are stored securely and never exposed after saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  {[
                    { name: "openaiKey" as const, label: "OpenAI API Key", placeholder: "sk-...", statusKey: "openai" as const },
                    { name: "deepseekKey" as const, label: "DeepSeek API Key", placeholder: "sk-...", statusKey: "deepseek" as const },
                    { name: "claudeKey" as const, label: "Anthropic API Key (Claude)", placeholder: "sk-ant-...", statusKey: "claude" as const },
                  ].map(({ name, label, placeholder, statusKey }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>{label}</FormLabel>
                            {status?.[statusKey] ? (
                              <span className="flex items-center text-xs text-green-500 font-medium">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
                              </span>
                            ) : (
                              <span className="flex items-center text-xs text-destructive font-medium">
                                <XCircle className="h-3 w-3 mr-1" /> Not Configured
                              </span>
                            )}
                          </div>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={status?.[statusKey] ? "••••••••••••••••••••••••••••••••" : placeholder}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <div className="bg-muted/50 p-4 rounded-md text-sm text-muted-foreground">
                  Leave blank to keep existing keys. Providing a new key overwrites the current one.
                </div>
                <Button type="submit" disabled={saveKeys.isPending}>
                  {saveKeys.isPending ? "Saving..." : "Save API Keys"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
