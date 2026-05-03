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
import { Check, X, LogOut, Wifi, WifiOff, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { currentUnifiedUser } from "@/components/auth-gate";
import { firebaseSignOut } from "@/lib/firebase";

// ── Static model lists per provider ──────────────────────────────────────────

const PROVIDER_MODELS: Record<string, string[]> = {
  OpenAI: [
    "gpt-4o", "gpt-4o-mini", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20",
    "gpt-4-turbo", "gpt-4-turbo-2024-04-09", "gpt-4", "gpt-4-0613",
    "gpt-3.5-turbo", "gpt-3.5-turbo-0125", "gpt-3.5-turbo-1106",
    "o1", "o1-2024-12-17", "o3", "o3-2025-04-16", "o3-mini", "o3-mini-2025-01-31",
    "o4-mini", "o4-mini-2025-04-16",
    "gpt-4.1", "gpt-4.1-2025-04-14", "gpt-4.1-mini", "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-nano", "gpt-4.1-nano-2025-04-14",
    "gpt-4o-search-preview", "gpt-4o-mini-search-preview",
  ],
  Gemini: [
    "models/gemini-2.5-pro", "models/gemini-2.5-flash", "models/gemini-2.5-flash-lite",
    "models/gemini-2.0-flash", "models/gemini-2.0-flash-001", "models/gemini-2.0-flash-lite",
    "models/gemini-flash-latest", "models/gemini-pro-latest",
    "models/gemma-3-27b-it", "models/gemma-3-12b-it", "models/gemma-3-4b-it", "models/gemma-3-1b-it",
  ],
  DeepSeek: [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
  ],
  Claude: [
    "claude-opus-4-20250514", "claude-sonnet-4-20250514",
    "claude-opus-4-5-20251101", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001",
    "claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4-7",
    "claude-opus-4-1-20250805",
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

type TestStatus = "idle" | "testing" | "success" | "error";

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
    queryFn: () => fetch("/api/settings/judge-models", { credentials: "include" }).then((r) => r.json()),
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
        return r.json() as Promise<JudgeModelConfig>;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "judge-model"] });
    },
  });
}

function useTestConnection() {
  return useMutation<
    { success: boolean; confirmedModel?: string; response?: string },
    { error: string },
    { provider: string; modelVersion: string }
  >({
    mutationFn: (body) =>
      fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw data;
        return data;
      }),
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { logout: replitLogout } = useAuth();
  const { data: status, isLoading: isLoadingKeys } = useGetApiKeyStatus();
  const { data: judgeModel, isLoading: isLoadingJudge } = useJudgeModel();
  const { data: providers, isLoading: isLoadingProviders } = useJudgeProviders();
  const saveKeys = useSaveApiKeys();
  const setJudgeModel = useSetJudgeModel();
  const testConn = useTestConnection();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const user = currentUnifiedUser;

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [modelVersion, setModelVersion] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [testConfirmedModel, setTestConfirmedModel] = useState("");

  const selectedProvider = providers?.find((p) => p.id === selectedProviderId);
  const selectedMeta = selectedProvider ? PROVIDER_META[selectedProvider.provider] : null;
  const staticModels = selectedProvider ? (PROVIDER_MODELS[selectedProvider.provider] ?? []) : [];

  const keysForm = useForm<KeysFormValues>({
    resolver: zodResolver(keysSchema),
    defaultValues: { openaiKey: "", geminiKey: "", deepseekKey: "", claudeKey: "" },
  });

  async function handleLogout() {
    // Delete API keys from DB before logging out for security
    try {
      await fetch("/api/settings/api-keys", { method: "DELETE", credentials: "include" });
    } catch { /* ignore errors — proceed with logout anyway */ }

    if (user?.provider === "firebase") {
      await firebaseSignOut();
      await fetch("/api/auth/firebase-logout", { method: "POST", credentials: "include" });
      window.location.reload();
    } else {
      replitLogout();
    }
  }

  function onSaveKeys(data: KeysFormValues) {
    saveKeys.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiKeyStatusQueryKey() });
        keysForm.reset();
        // Reset test status since keys changed
        setTestStatus("idle");
        setTestMessage("");
        toast({ title: "API keys saved", description: "Your credentials have been updated." });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: (err as { error?: string }).error || "An error occurred", variant: "destructive" });
      },
    });
  }

  function handleSelectProvider(p: ProviderRow) {
    setSelectedProviderId(p.id);
    setTestStatus("idle");
    setTestMessage("");
    setTestConfirmedModel("");
    if (judgeModel?.judgeModelId === p.id && judgeModel.modelVersion) {
      setModelVersion(judgeModel.modelVersion);
    } else {
      setModelVersion("");
    }
  }

  function handleModelChange(v: string) {
    setModelVersion(v);
    setTestStatus("idle");
    setTestMessage("");
    setTestConfirmedModel("");
  }

  function handleTestConnection() {
    if (!selectedProvider || !modelVersion) return;
    setTestStatus("testing");
    setTestMessage("");
    setTestConfirmedModel("");
    testConn.mutate(
      { provider: selectedProvider.provider, modelVersion },
      {
        onSuccess: (res) => {
          setTestStatus("success");
          setTestConfirmedModel(res.confirmedModel ?? modelVersion);
          setTestMessage(`Response: "${res.response}"`);
        },
        onError: (err) => {
          setTestStatus("error");
          setTestMessage(err.error ?? "Connection failed");
        },
      }
    );
  }

  function handleSaveJudge() {
    if (!selectedProviderId || !modelVersion.trim()) return;
    setJudgeModel.mutate(
      { judgeModelId: selectedProviderId, modelVersion: modelVersion.trim() },
      {
        onSuccess: (data: JudgeModelConfig) => {
          setSelectedProviderId(null);
          setModelVersion("");
          setTestStatus("idle");
          setTestMessage("");
          toast({ title: "Judge model saved", description: `Now using ${data.modelVersion} via ${data.displayName}.` });
        },
        onError: () => {
          toast({ title: "Failed to save", description: "Could not save judge model.", variant: "destructive" });
        },
      }
    );
  }

  // Determine if the active judge model has its API key configured
  const activeProvider = providers?.find((p) => p.id === judgeModel?.judgeModelId);
  const activeMeta = activeProvider ? PROVIDER_META[activeProvider.provider] : null;
  const activeHasKey = activeMeta && status ? !!status[activeMeta.statusKey] : false;

  const displayName = user?.displayName ?? null;
  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

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
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
            </div>
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="avatar" className="w-9 h-9 rounded-full border border-border" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {initials}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
              title="Log out (clears API keys)"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <span>
          Your API keys are stored privately per account and <strong>deleted automatically on logout</strong> — they are never shared or exposed to other users.
        </span>
      </div>

      {/* Judge Model Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Judge Model</CardTitle>
          <p className="text-xs text-muted-foreground">The large LLM that generates reference answers and evaluates responses</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active model status */}
          {isLoadingJudge || isLoadingKeys ? (
            <Skeleton className="h-14 w-full" />
          ) : judgeModel?.judgeModelId && judgeModel.modelVersion ? (
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              activeHasKey
                ? `${activeMeta?.bg} ${activeMeta?.border}`
                : "bg-red-50 border-red-300"
            }`}>
              <div>
                <p className={`font-semibold text-sm ${activeHasKey ? activeMeta?.text : "text-red-700"}`}>
                  {judgeModel.modelVersion}
                </p>
                <p className={`text-xs mt-0.5 opacity-70 ${activeHasKey ? activeMeta?.text : "text-red-600"}`}>
                  {activeMeta?.label}
                </p>
              </div>
              {activeHasKey ? (
                <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${activeMeta?.bg} ${activeMeta?.text} ${activeMeta?.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${activeMeta?.dot}`} />
                  Active
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 border-red-300 text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  No API key
                </span>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">No judge model configured. Select a provider and model below.</p>
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

              <div className="grid grid-cols-2 gap-2">
                {providers?.map((p) => {
                  const meta = PROVIDER_META[p.provider];
                  const providerHasKey = status ? !!status[meta.statusKey] : false;
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
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${isSelected || isActive ? meta.text : "text-foreground"}`}>
                          {meta.label}
                        </p>
                        {isActive && judgeModel?.modelVersion && (
                          <p className={`text-xs truncate opacity-70 ${meta.text}`}>{judgeModel.modelVersion}</p>
                        )}
                      </div>
                      {/* Key indicator dot */}
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${providerHasKey ? "bg-green-500" : "bg-muted-foreground/30"}`}
                        title={providerHasKey ? "API key configured" : "No API key"}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Model selection + test panel */}
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
                    {!status?.[selectedMeta.statusKey] && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Save your {selectedMeta.label} API key below before testing
                      </p>
                    )}
                  </div>

                  {/* Model dropdown */}
                  <Select value={modelVersion} onValueChange={handleModelChange}>
                    <SelectTrigger className={`bg-background border ${selectedMeta.border} h-9 text-sm focus:ring-2 focus:ring-offset-1 ${selectedMeta.ring}`}>
                      <SelectValue placeholder="— select a model —" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {staticModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-sm font-mono">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Test connection result */}
                  <AnimatePresence>
                    {testStatus !== "idle" && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                          testStatus === "success"
                            ? "bg-green-50 border-green-300 text-green-700"
                            : testStatus === "error"
                            ? "bg-red-50 border-red-300 text-red-700"
                            : "bg-background border-border text-muted-foreground"
                        }`}
                      >
                        {testStatus === "testing" && <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />}
                        {testStatus === "success" && <Wifi className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" />}
                        {testStatus === "error" && <WifiOff className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />}
                        <div>
                          {testStatus === "testing" && <span>Connecting to {selectedMeta.label}…</span>}
                          {testStatus === "success" && (
                            <div>
                              <p className="font-semibold">Connected successfully</p>
                              {testConfirmedModel && (
                                <p className="opacity-80 mt-0.5">Model: <span className="font-mono">{testConfirmedModel}</span></p>
                              )}
                              {testMessage && <p className="opacity-60 mt-0.5">{testMessage}</p>}
                            </div>
                          )}
                          {testStatus === "error" && (
                            <div>
                              <p className="font-semibold">Connection failed</p>
                              <p className="opacity-80 mt-0.5">{testMessage}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {/* Test connection */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={!modelVersion || testStatus === "testing" || !status?.[selectedMeta.statusKey]}
                      className={`h-9 gap-1.5 ${
                        testStatus === "success"
                          ? "border-green-400 text-green-700 bg-green-50 hover:bg-green-100"
                          : testStatus === "error"
                          ? "border-red-400 text-red-700 bg-red-50 hover:bg-red-100"
                          : ""
                      }`}
                      title={!status?.[selectedMeta.statusKey] ? "Save API key first" : undefined}
                    >
                      {testStatus === "testing" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : testStatus === "success" ? (
                        <Wifi className="h-3.5 w-3.5" />
                      ) : testStatus === "error" ? (
                        <WifiOff className="h-3.5 w-3.5" />
                      ) : (
                        <Wifi className="h-3.5 w-3.5" />
                      )}
                      {testStatus === "testing" ? "Testing…" : testStatus === "success" ? "Connected" : testStatus === "error" ? "Retry Test" : "Test Connection"}
                    </Button>

                    {/* Save — only enabled if test passed */}
                    <Button
                      size="sm"
                      onClick={handleSaveJudge}
                      disabled={!modelVersion.trim() || setJudgeModel.isPending || testStatus !== "success"}
                      className="h-9 px-4 gap-1.5"
                      title={testStatus !== "success" ? "Run Test Connection first" : undefined}
                    >
                      {setJudgeModel.isPending ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                      ) : (
                        <><Check className="h-3.5 w-3.5" /> Save</>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedProviderId(null);
                        setModelVersion("");
                        setTestStatus("idle");
                        setTestMessage("");
                      }}
                      className="h-9 px-3 text-muted-foreground"
                    >
                      Cancel
                    </Button>
                  </div>

                  {testStatus !== "success" && modelVersion && status?.[selectedMeta.statusKey] && (
                    <p className="text-xs text-muted-foreground">
                      Run <strong>Test Connection</strong> to verify the model is reachable before saving.
                    </p>
                  )}
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
          <p className="text-xs text-muted-foreground">
            Your private credentials — isolated per account, cleared on logout
          </p>
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
