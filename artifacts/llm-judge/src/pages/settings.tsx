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
import { Check, X } from "lucide-react";
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
  provider: string | null;
  displayName: string | null;
  modelVersion: string | null;
}

interface ProviderRow {
  id: number;
  provider: string;
  displayName: string;
}

const PROVIDER_META: Record<string, {
  label: string;
  dot: string;
  ring: string;
  bg: string;
  text: string;
  border: string;
  placeholder: string;
  hint: string;
}> = {
  OpenAI:   { label: "OpenAI",   dot: "bg-emerald-500", ring: "ring-emerald-300", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-300", placeholder: "e.g. gpt-4o-mini",              hint: "gpt-4o · gpt-4o-mini · gpt-4-turbo" },
  Gemini:   { label: "Google",   dot: "bg-blue-500",    ring: "ring-blue-300",    bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-300",    placeholder: "e.g. gemini-2.0-flash",         hint: "gemini-2.0-flash · gemini-1.5-pro" },
  Claude:   { label: "Anthropic",dot: "bg-orange-500",  ring: "ring-orange-300",  bg: "bg-orange-50",   text: "text-orange-700",  border: "border-orange-300",  placeholder: "e.g. claude-3-5-haiku-20241022",hint: "claude-3-5-sonnet-20241022 · claude-3-5-haiku-20241022" },
  DeepSeek: { label: "DeepSeek", dot: "bg-purple-500",  ring: "ring-purple-300",  bg: "bg-purple-50",   text: "text-purple-700",  border: "border-purple-300",  placeholder: "e.g. deepseek-chat",            hint: "deepseek-chat · deepseek-reasoner" },
};

function useJudgeModel() {
  return useQuery<JudgeModelConfig>({
    queryKey: ["settings", "judge-model"],
    queryFn: () => fetch("/api/settings/judge-model").then((r) => r.json()),
  });
}

function useJudgeProviders() {
  return useQuery<ProviderRow[]>({
    queryKey: ["settings", "judge-models-list"],
    queryFn: () => fetch("/api/settings/judge-models").then((r) => r.json()),
  });
}

function useSetJudgeModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { judgeModelId: number; modelVersion: string }) =>
      fetch("/api/settings/judge-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async (r) => {
        if (!r.ok) throw await r.json();
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "judge-model"] });
    },
  });
}

export default function Settings() {
  const { data: status, isLoading: isLoadingKeys } = useGetApiKeyStatus();
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const { data: providers, isLoading: isLoadingProviders } = useJudgeProviders();
  const saveKeys = useSaveApiKeys();
  const setJudgeModel = useSetJudgeModel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [modelVersion, setModelVersion] = useState("");

  const keysForm = useForm<KeysFormValues>({
    resolver: zodResolver(keysSchema),
    defaultValues: { openaiKey: "", geminiKey: "", deepseekKey: "", claudeKey: "" },
  });

  function onSaveKeys(data: KeysFormValues) {
    saveKeys.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiKeyStatusQueryKey() });
        keysForm.reset();
        toast({ title: "API keys saved", description: "Provider credentials updated successfully." });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: err.error || "An error occurred", variant: "destructive" });
      },
    });
  }

  function handleSelectProvider(p: ProviderRow) {
    setSelectedProviderId(p.id);
    // Pre-fill with current version if same provider
    if (judgeModel?.judgeModelId === p.id && judgeModel.modelVersion) {
      setModelVersion(judgeModel.modelVersion);
    } else {
      setModelVersion("");
    }
  }

  function handleSaveJudge() {
    if (!selectedProviderId || !modelVersion.trim()) return;
    setJudgeModel.mutate({ judgeModelId: selectedProviderId, modelVersion: modelVersion.trim() }, {
      onSuccess: (data) => {
        setSelectedProviderId(null);
        setModelVersion("");
        toast({ title: "Judge model saved", description: `Now using ${data.modelVersion} via ${data.displayName}.` });
      },
      onError: () => {
        toast({ title: "Failed to save", description: "Could not save judge model.", variant: "destructive" });
      },
    });
  }

  const activeProvider = providers?.find((p) => p.id === judgeModel?.judgeModelId);
  const activeMeta = activeProvider ? PROVIDER_META[activeProvider.provider] : null;
  const selectedProvider = providers?.find((p) => p.id === selectedProviderId);
  const selectedMeta = selectedProvider ? PROVIDER_META[selectedProvider.provider] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-2xl space-y-6 pb-12"
    >
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your judge model and API credentials</p>
      </div>

      {/* Judge Model Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Judge Model</CardTitle>
          <p className="text-xs text-muted-foreground">The LLM responsible for evaluating all model responses</p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Active judge */}
          {isLoadingJudge ? (
            <Skeleton className="h-14 w-full" />
          ) : judgeModel?.judgeModelId && judgeModel.modelVersion ? (
            <div className={`flex items-center justify-between p-3 rounded-lg border ${activeMeta?.bg} ${activeMeta?.border}`}>
              <div>
                <p className={`font-semibold text-sm ${activeMeta?.text}`}>{judgeModel.modelVersion}</p>
                <p className={`text-xs mt-0.5 opacity-70 ${activeMeta?.text}`}>{activeMeta?.label}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${activeMeta?.bg} ${activeMeta?.text} border ${activeMeta?.border}`}>
                Active
              </span>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">No judge model configured. Select a provider below.</p>
            </div>
          )}

          {/* Provider selection */}
          {isLoadingProviders ? (
            <div className="grid grid-cols-2 gap-2">
              {[0,1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {judgeModel?.judgeModelId ? "Change judge model" : "Select a provider"}
              </p>

              {/* 2×2 provider grid */}
              <div className="grid grid-cols-2 gap-2">
                {providers?.map((p) => {
                  const meta = PROVIDER_META[p.provider];
                  const isActive = judgeModel?.judgeModelId === p.id && !selectedProviderId;
                  const isSelected = selectedProviderId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? `${meta.bg} ${meta.border} ring-2 ${meta.ring}`
                          : isActive
                          ? `${meta.bg} ${meta.border}`
                          : "bg-background border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected || isActive ? meta.text : "text-foreground"}`}>
                          {meta.label}
                        </p>
                        {isActive && judgeModel?.modelVersion && (
                          <p className={`text-xs truncate opacity-70 ${meta.text}`}>{judgeModel.modelVersion}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Model version input — shown only when a provider is selected */}
              {selectedProvider && selectedMeta && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className={`rounded-lg border ${selectedMeta.border} ${selectedMeta.bg} p-4 space-y-3`}
                >
                  <div className="space-y-1">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${selectedMeta.text}`}>
                      {selectedMeta.label} model name
                    </label>
                    <p className="text-xs text-muted-foreground">{selectedMeta.hint}</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={modelVersion}
                      onChange={(e) => setModelVersion(e.target.value)}
                      placeholder={selectedMeta.placeholder}
                      className="bg-background text-sm h-9 flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveJudge(); }}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveJudge}
                      disabled={!modelVersion.trim() || setJudgeModel.isPending}
                      className="h-9 px-4 shrink-0"
                    >
                      {setJudgeModel.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSelectedProviderId(null); setModelVersion(""); }}
                      className="h-9 px-3 shrink-0 text-muted-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Keys Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">API Keys</CardTitle>
          <p className="text-xs text-muted-foreground">Required for the judge model to call inference APIs</p>
        </CardHeader>
        <CardContent>
          {isLoadingKeys ? (
            <div className="space-y-4">
              {[0,1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Form {...keysForm}>
              <form onSubmit={keysForm.handleSubmit(onSaveKeys)} className="space-y-4">
                {[
                  { name: "openaiKey" as const,  label: "OpenAI",            placeholder: "sk-…",           statusKey: "openai" as const },
                  { name: "geminiKey" as const,   label: "Google Gemini",     placeholder: "AIza…",          statusKey: "gemini" as const },
                  { name: "deepseekKey" as const, label: "DeepSeek",          placeholder: "sk-…",           statusKey: "deepseek" as const },
                  { name: "claudeKey" as const,   label: "Anthropic (Claude)",placeholder: "sk-ant-…",       statusKey: "claude" as const },
                ].map(({ name, label, placeholder, statusKey }) => (
                  <FormField
                    key={name}
                    control={keysForm.control}
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
                  {saveKeys.isPending ? "Saving…" : "Save API Keys"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
