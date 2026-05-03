import {
  useGetApiKeyStatus,
  useSaveApiKeys,
  getGetApiKeyStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const keysSchema = z.object({
  openaiKey: z.string().optional(),
  geminiKey: z.string().optional(),
  deepseekKey: z.string().optional(),
  claudeKey: z.string().optional(),
});

type KeysFormValues = z.infer<typeof keysSchema>;

interface JudgeModelConfig {
  judgeModelId: number | null;
  displayName: string | null;
  provider: string | null;
  modelVersion: string | null;
}

interface JudgeModelOption {
  id: number;
  provider: string;
  displayName: string;
  modelVersion: string;
}

const PROVIDER_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  OpenAI:   { label: "OpenAI",   color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", dot: "bg-emerald-500" },
  Gemini:   { label: "Google",   color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-200",    dot: "bg-blue-500" },
  Claude:   { label: "Anthropic",color: "text-orange-700",  bg: "bg-orange-50",   border: "border-orange-200",  dot: "bg-orange-500" },
  DeepSeek: { label: "DeepSeek", color: "text-purple-700",  bg: "bg-purple-50",   border: "border-purple-200",  dot: "bg-purple-500" },
};

function useJudgeModel() {
  return useQuery<JudgeModelConfig>({
    queryKey: ["settings", "judge-model"],
    queryFn: () => fetch("/api/settings/judge-model").then((r) => r.json()),
  });
}

function useJudgeModelList() {
  return useQuery<JudgeModelOption[]>({
    queryKey: ["settings", "judge-models-list"],
    queryFn: () => fetch("/api/settings/judge-models").then((r) => r.json()),
  });
}

function useSetJudgeModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (judgeModelId: number) =>
      fetch("/api/settings/judge-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeModelId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "judge-model"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "judge-models-list"] });
    },
  });
}

export default function Settings() {
  const { data: status, isLoading } = useGetApiKeyStatus();
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const { data: judgeModels, isLoading: isLoadingList } = useJudgeModelList();
  const saveKeys = useSaveApiKeys();
  const setJudgeModel = useSetJudgeModel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const form = useForm<KeysFormValues>({
    resolver: zodResolver(keysSchema),
    defaultValues: { openaiKey: "", geminiKey: "", deepseekKey: "", claudeKey: "" },
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

  function handleSetJudge(model: JudgeModelOption) {
    setJudgeModel.mutate(model.id, {
      onSuccess: () => {
        toast({ title: "Judge model updated", description: `Now using ${model.displayName} as the judge.` });
      },
      onError: () => {
        toast({ title: "Failed to update", description: "Could not save judge model selection.", variant: "destructive" });
      },
    });
  }

  // Group models by provider
  const grouped = (judgeModels ?? []).reduce<Record<string, JudgeModelOption[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  const providerOrder = ["OpenAI", "Gemini", "Claude", "DeepSeek"];

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
          {/* Active judge display */}
          {isLoadingJudge ? (
            <Skeleton className="h-14 w-full" />
          ) : judgeModel?.judgeModelId ? (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div>
                <p className="font-semibold text-green-800">{judgeModel.displayName}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {PROVIDER_META[judgeModel.provider ?? ""]?.label ?? judgeModel.provider} · {judgeModel.modelVersion}
                </p>
              </div>
              <span className="text-xs font-medium bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">Active</span>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">No judge model selected. Choose one below to enable evaluation.</p>
            </div>
          )}

          {/* Model selector grouped by provider */}
          {isLoadingList ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {judgeModel?.judgeModelId ? "Change judge model" : "Select judge model"}
              </p>
              <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                {providerOrder.map((provider) => {
                  const models = grouped[provider] ?? [];
                  if (models.length === 0) return null;
                  const meta = PROVIDER_META[provider];
                  const isOpen = expandedProvider === provider;

                  return (
                    <div key={provider}>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedProvider(isOpen ? null : provider)}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                          <span className="text-sm font-medium text-foreground">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">{models.length} model{models.length > 1 ? "s" : ""}</span>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {isOpen && (
                        <div className={`px-4 pb-3 pt-1 space-y-2 ${meta.bg}`}>
                          {models.map((m) => {
                            const isActive = judgeModel?.judgeModelId === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                disabled={setJudgeModel.isPending}
                                onClick={() => handleSetJudge(m)}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                  isActive
                                    ? `${meta.border} ${meta.bg} ring-1 ring-inset ring-current/20`
                                    : "border-border bg-background hover:bg-muted/60"
                                }`}
                              >
                                <div>
                                  <p className={`text-sm font-medium ${isActive ? meta.color : "text-foreground"}`}>
                                    {m.displayName}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{m.modelVersion}</p>
                                </div>
                                {isActive && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} ${meta.border} border`}>
                                    Active
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {[
                  { name: "openaiKey" as const,   label: "OpenAI",            placeholder: "sk-...",          statusKey: "openai" as const },
                  { name: "geminiKey" as const,    label: "Google Gemini",     placeholder: "AIza...",         statusKey: "gemini" as const },
                  { name: "deepseekKey" as const,  label: "DeepSeek",          placeholder: "sk-...",          statusKey: "deepseek" as const },
                  { name: "claudeKey" as const,    label: "Anthropic (Claude)",placeholder: "sk-ant-...",      statusKey: "claude" as const },
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
