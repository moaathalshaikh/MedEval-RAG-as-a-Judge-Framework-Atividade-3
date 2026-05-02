import {
  useGetApiKeyStatus,
  useSaveApiKeys,
  getGetApiKeyStatusQueryKey,
  useListModels,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, ShieldAlert, Cpu, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
        toast({ title: "Vault Updated", description: "Provider keys securely committed." });
      },
      onError: (err) => {
        toast({ title: "Vault Error", description: err.error || "Persistence failed", variant: "destructive" });
      },
    });
  }

  function handleSetJudge(modelId: string) {
    setJudgeModel.mutate(parseInt(modelId), {
      onSuccess: (data) => {
        toast({ title: "Evaluator Configured", description: `Active evaluator set to ${data.modelName}.` });
      },
      onError: () => {
        toast({ title: "Configuration Fault", description: "Failed to persist evaluator selection.", variant: "destructive" });
      },
    });
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl mx-auto space-y-8 pb-12"
    >
      <div className="border-b border-border pb-6">
        <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-primary" />
          System Configuration
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Authentication & Runtime Setup</p>
      </div>

      <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm shadow-md">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Global Evaluator Target
          </CardTitle>
          <CardDescription className="text-[10px] font-mono uppercase tracking-widest mt-1 opacity-70">
            Define the singular LLM agent responsible for output verification
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoadingJudge || isLoadingModels ? (
            <Skeleton className="h-16 w-full rounded-none" />
          ) : (
            <div className="space-y-6">
              {judgeModel?.modelId && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-background border border-border p-4 gap-4">
                  <div>
                    <div className="font-semibold text-lg">{judgeModel.modelName}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                      {judgeModel.provider} / {judgeModel.version}
                    </div>
                  </div>
                  <Badge className="rounded-none bg-primary text-primary-foreground font-mono text-[10px] tracking-widest uppercase self-start sm:self-auto shrink-0">
                    Active Evaluator
                  </Badge>
                </div>
              )}
              <div className="space-y-3 bg-muted/10 p-5 border border-border/50">
                <label className="text-[10px] font-mono tracking-widest uppercase text-foreground block">
                  {judgeModel?.modelId ? "Modify Evaluator Target" : "Assign Evaluator Target"}
                </label>
                <Select
                  onValueChange={handleSetJudge}
                  disabled={setJudgeModel.isPending}
                >
                  <SelectTrigger className="rounded-none bg-background font-mono text-sm h-12">
                    <SelectValue placeholder="SELECT REGISTERED AGENT..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-mono text-sm">
                    {models?.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.modelName} <span className="text-muted-foreground ml-2">[{m.provider}]</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Provider Vault
          </CardTitle>
          <CardDescription className="text-[10px] font-mono uppercase tracking-widest mt-1 opacity-70">
            Keys are required for inference. Inputs overwrite existing entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-8">
          {isLoading ? (
            <div className="space-y-8">
              <Skeleton className="h-14 w-full rounded-none" />
              <Skeleton className="h-14 w-full rounded-none" />
              <Skeleton className="h-14 w-full rounded-none" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-6">
                  {[
                    { name: "openaiKey" as const, label: "OpenAI Vault", placeholder: "sk-...", statusKey: "openai" as const },
                    { name: "deepseekKey" as const, label: "DeepSeek Vault", placeholder: "sk-...", statusKey: "deepseek" as const },
                    { name: "claudeKey" as const, label: "Anthropic Vault", placeholder: "sk-ant-...", statusKey: "claude" as const },
                  ].map(({ name, label, placeholder, statusKey }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <FormLabel className="text-[10px] font-mono uppercase tracking-widest text-foreground">{label}</FormLabel>
                            {status?.[statusKey] ? (
                              <Badge variant="outline" className="rounded-none font-mono text-[9px] uppercase tracking-widest border-green-500/30 text-green-500 bg-green-500/5 px-2 py-0.5 self-start sm:self-auto w-fit">
                                <Check className="h-3 w-3 mr-1" /> Provisioned
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="rounded-none font-mono text-[9px] uppercase tracking-widest border-destructive/30 text-destructive bg-destructive/5 px-2 py-0.5 self-start sm:self-auto w-fit">
                                <X className="h-3 w-3 mr-1" /> Unprovisioned
                              </Badge>
                            )}
                          </div>
                          <FormControl>
                            <Input
                              type="password"
                              className="rounded-none bg-background/50 font-mono text-sm h-12"
                              placeholder={status?.[statusKey] ? "••••••••••••••••••••••••••••••••" : placeholder}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-[10px] font-mono" />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                
                <div className="pt-6 border-t border-border/50">
                  <Button type="submit" disabled={saveKeys.isPending} className="w-full rounded-none font-mono tracking-widest uppercase text-sm h-14 bg-primary text-primary-foreground hover:bg-primary/90 transition-all">
                    {saveKeys.isPending ? "Commiting to Vault..." : "Commit API Credentials"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}