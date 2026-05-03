import {
  useGetApiKeyStatus,
  useSaveApiKeys,
  getGetApiKeyStatusQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
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
import { Check, X, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

// ── Static model lists per provider ──────────────────────────────────────────

const PROVIDER_MODELS: Record<string, string[]> = {
  OpenAI: [
    "text-embedding-ada-002",
    "whisper-1",
    "gpt-3.5-turbo",
    "tts-1",
    "gpt-3.5-turbo-16k",
    "gpt-4-0613",
    "gpt-4",
    "davinci-002",
    "babbage-002",
    "gpt-3.5-turbo-instruct",
    "gpt-3.5-turbo-instruct-0914",
    "dall-e-3",
    "dall-e-2",
    "gpt-3.5-turbo-1106",
    "tts-1-hd",
    "tts-1-1106",
    "tts-1-hd-1106",
    "text-embedding-3-small",
    "text-embedding-3-large",
    "gpt-3.5-turbo-0125",
    "gpt-4-turbo",
    "gpt-4-turbo-2024-04-09",
    "gpt-4o",
    "gpt-4o-2024-05-13",
    "gpt-4o-mini-2024-07-18",
    "gpt-4o-mini",
    "gpt-4o-2024-08-06",
    "gpt-4o-audio-preview",
    "gpt-4o-realtime-preview",
    "omni-moderation-latest",
    "omni-moderation-2024-09-26",
    "gpt-4o-realtime-preview-2024-12-17",
    "gpt-4o-audio-preview-2024-12-17",
    "gpt-4o-mini-realtime-preview-2024-12-17",
    "gpt-4o-mini-audio-preview-2024-12-17",
    "o1-2024-12-17",
    "o1",
    "gpt-4o-mini-realtime-preview",
    "gpt-4o-mini-audio-preview",
    "o3-mini",
    "o3-mini-2025-01-31",
    "gpt-4o-2024-11-20",
    "gpt-4o-mini-search-preview-2025-03-11",
    "gpt-4o-mini-search-preview",
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
    "o1-pro-2025-03-19",
    "o1-pro",
    "gpt-4o-mini-tts",
    "o3-2025-04-16",
    "o4-mini-2025-04-16",
    "o3",
    "o4-mini",
    "gpt-4.1-2025-04-14",
    "gpt-4.1",
    "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-mini",
    "gpt-4.1-nano-2025-04-14",
    "gpt-4.1-nano",
    "gpt-image-1",
    "gpt-4o-realtime-preview-2025-06-03",
    "gpt-4o-audio-preview-2025-06-03",
    "gpt-4o-transcribe-diarize",
    "gpt-5-chat-latest",
    "gpt-5-2025-08-07",
    "gpt-5",
    "gpt-5-mini-2025-08-07",
    "gpt-5-mini",
    "gpt-5-nano-2025-08-07",
    "gpt-5-nano",
    "gpt-audio-2025-08-28",
    "gpt-realtime",
    "gpt-realtime-2025-08-28",
    "gpt-audio",
    "gpt-5-codex",
    "gpt-image-1-mini",
    "gpt-5-pro-2025-10-06",
    "gpt-5-pro",
    "gpt-audio-mini",
    "gpt-audio-mini-2025-10-06",
    "gpt-5-search-api",
    "gpt-realtime-mini",
    "gpt-realtime-mini-2025-10-06",
    "sora-2",
    "sora-2-pro",
    "gpt-5-search-api-2025-10-14",
    "gpt-5.1-chat-latest",
    "gpt-5.1-2025-11-13",
    "gpt-5.1",
    "gpt-5.1-codex",
    "gpt-5.1-codex-mini",
    "gpt-5.1-codex-max",
    "gpt-image-1.5",
    "gpt-5.2-2025-12-11",
    "gpt-5.2",
    "gpt-5.2-pro-2025-12-11",
    "gpt-5.2-pro",
    "gpt-5.2-chat-latest",
    "gpt-4o-mini-transcribe-2025-12-15",
    "gpt-4o-mini-transcribe-2025-03-20",
    "gpt-4o-mini-tts-2025-03-20",
    "gpt-4o-mini-tts-2025-12-15",
    "gpt-realtime-mini-2025-12-15",
    "gpt-audio-mini-2025-12-15",
    "chatgpt-image-latest",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "gpt-realtime-1.5",
    "gpt-audio-1.5",
    "gpt-4o-search-preview",
    "gpt-4o-search-preview-2025-03-11",
    "gpt-5.3-chat-latest",
    "gpt-5.4-2026-03-05",
    "gpt-5.4-pro",
    "gpt-5.4-pro-2026-03-05",
    "gpt-5.4",
    "gpt-5.4-nano-2026-03-17",
    "gpt-5.4-nano",
    "gpt-5.4-mini-2026-03-17",
    "gpt-5.4-mini",
    "gpt-image-2",
    "gpt-image-2-2026-04-21",
    "gpt-5.5",
    "gpt-5.5-2026-04-23",
    "gpt-5.5-pro",
    "gpt-5.5-pro-2026-04-23",
  ],
  Gemini: [
    "models/gemini-2.5-flash",
    "models/gemini-2.5-pro",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-001",
    "models/gemini-2.0-flash-lite-001",
    "models/gemini-2.0-flash-lite",
    "models/gemini-2.5-flash-preview-tts",
    "models/gemini-2.5-pro-preview-tts",
    "models/gemma-3-1b-it",
    "models/gemma-3-4b-it",
    "models/gemma-3-12b-it",
    "models/gemma-3-27b-it",
    "models/gemma-3n-e4b-it",
    "models/gemma-3n-e2b-it",
    "models/gemma-4-26b-a4b-it",
    "models/gemma-4-31b-it",
    "models/gemini-flash-latest",
    "models/gemini-flash-lite-latest",
    "models/gemini-pro-latest",
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.5-flash-image",
    "models/gemini-3-pro-preview",
    "models/gemini-3-flash-preview",
    "models/gemini-3.1-pro-preview",
    "models/gemini-3.1-pro-preview-customtools",
    "models/gemini-3.1-flash-lite-preview",
    "models/gemini-3-pro-image-preview",
    "models/nano-banana-pro-preview",
    "models/gemini-3.1-flash-image-preview",
    "models/lyria-3-clip-preview",
    "models/lyria-3-pro-preview",
    "models/gemini-3.1-flash-tts-preview",
    "models/gemini-robotics-er-1.5-preview",
    "models/gemini-robotics-er-1.6-preview",
    "models/gemini-2.5-computer-use-preview-10-2025",
    "models/deep-research-max-preview-04-2026",
    "models/deep-research-preview-04-2026",
    "models/deep-research-pro-preview-12-2025",
    "models/gemini-embedding-001",
    "models/gemini-embedding-2-preview",
    "models/gemini-embedding-2",
    "models/aqa",
    "models/imagen-4.0-generate-001",
    "models/imagen-4.0-ultra-generate-001",
    "models/imagen-4.0-fast-generate-001",
    "models/veo-2.0-generate-001",
    "models/veo-3.0-generate-001",
    "models/veo-3.0-fast-generate-001",
    "models/veo-3.1-generate-preview",
    "models/veo-3.1-fast-generate-preview",
    "models/veo-3.1-lite-generate-preview",
    "models/gemini-2.5-flash-native-audio-latest",
    "models/gemini-2.5-flash-native-audio-preview-09-2025",
    "models/gemini-2.5-flash-native-audio-preview-12-2025",
    "models/gemini-3.1-flash-live-preview",
  ],
  DeepSeek: [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
  ],
  Claude: [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
  ],
};

// ── Types & meta ──────────────────────────────────────────────────────────────

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
  statusKey: "openai" | "gemini" | "deepseek" | "claude";
}> = {
  OpenAI:   { label: "OpenAI",    dot: "bg-emerald-500", ring: "ring-emerald-300", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-300", statusKey: "openai" },
  Gemini:   { label: "Google",    dot: "bg-blue-500",    ring: "ring-blue-300",    bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-300",    statusKey: "gemini" },
  Claude:   { label: "Anthropic", dot: "bg-orange-500",  ring: "ring-orange-300",  bg: "bg-orange-50",   text: "text-orange-700",  border: "border-orange-300",  statusKey: "claude" },
  DeepSeek: { label: "DeepSeek",  dot: "bg-purple-500",  ring: "ring-purple-300",  bg: "bg-purple-50",   text: "text-purple-700",  border: "border-purple-300",  statusKey: "deepseek" },
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useJudgeModel() {
  return useQuery<JudgeModelConfig>({
    queryKey: ["settings", "judge-model"],
    queryFn: () => fetch("/api/settings/judge-model", { credentials: "include" }).then((r) => r.json()),
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
        credentials: "include",
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, logout } = useAuth();
  const { data: status, isLoading: isLoadingKeys } = useGetApiKeyStatus();
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const { data: providers, isLoading: isLoadingProviders } = useJudgeProviders();
  const saveKeys = useSaveApiKeys();
  const setJudgeModel = useSetJudgeModel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [modelVersion, setModelVersion] = useState("");

  const selectedProvider = providers?.find((p) => p.id === selectedProviderId);
  const selectedMeta = selectedProvider ? PROVIDER_META[selectedProvider.provider] : null;
  const staticModels = selectedProvider ? (PROVIDER_MODELS[selectedProvider.provider] ?? []) : [];

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
        toast({ title: "Failed to save", description: (err as { error?: string }).error || "An error occurred", variant: "destructive" });
      },
    });
  }

  function handleSelectProvider(p: ProviderRow) {
    setSelectedProviderId(p.id);
    if (judgeModel?.judgeModelId === p.id && judgeModel.modelVersion) {
      setModelVersion(judgeModel.modelVersion);
    } else {
      setModelVersion("");
    }
  }

  function handleSaveJudge() {
    if (!selectedProviderId || !modelVersion.trim()) return;
    setJudgeModel.mutate({ judgeModelId: selectedProviderId, modelVersion: modelVersion.trim() }, {
      onSuccess: (data: JudgeModelConfig) => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-2xl space-y-6 pb-12"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your judge model and API credentials</p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">
                {user.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : user.email ?? "User"}
              </p>
              {user.email && user.firstName && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="avatar" className="w-8 h-8 rounded-full border border-border" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {(user.firstName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={logout} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Judge Model Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Judge Model</CardTitle>
          <p className="text-xs text-muted-foreground">The LLM responsible for evaluating all model responses</p>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {isLoadingProviders ? (
            <div className="grid grid-cols-2 gap-2">
              {[0,1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {judgeModel?.judgeModelId ? "Change judge model" : "Select a provider"}
              </p>

              {/* Provider grid */}
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

              {/* Model selection panel */}
              {selectedProvider && selectedMeta && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className={`rounded-lg border ${selectedMeta.border} ${selectedMeta.bg} p-4 space-y-3 overflow-hidden`}
                >
                  <div className="space-y-1">
                    <label className={`text-xs font-semibold uppercase tracking-wide ${selectedMeta.text}`}>
                      {selectedMeta.label} model
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {staticModels.length} models available
                    </p>
                  </div>

                  {/* Static dropdown */}
                  <Select value={modelVersion} onValueChange={setModelVersion}>
                    <SelectTrigger className={`bg-background border ${selectedMeta.border} h-9 text-sm focus:ring-2 focus:ring-offset-1 ${selectedMeta.ring}`}>
                      <SelectValue placeholder="— select a model —" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {staticModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-sm font-mono">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveJudge}
                      disabled={!modelVersion.trim() || setJudgeModel.isPending}
                      className="h-9 px-4"
                    >
                      {setJudgeModel.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSelectedProviderId(null); setModelVersion(""); }}
                      className="h-9 px-3 text-muted-foreground"
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
          <p className="text-xs text-muted-foreground">Your private credentials — each account has its own isolated keys</p>
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
                  { name: "openaiKey" as const,  label: "OpenAI",             placeholder: "sk-…",      statusKey: "openai" as const },
                  { name: "geminiKey" as const,   label: "Google Gemini",      placeholder: "AIza…",     statusKey: "gemini" as const },
                  { name: "deepseekKey" as const, label: "DeepSeek",           placeholder: "sk-…",      statusKey: "deepseek" as const },
                  { name: "claudeKey" as const,   label: "Anthropic (Claude)", placeholder: "sk-ant-…",  statusKey: "claude" as const },
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
