import { useGetApiKeyStatus, useSaveApiKeys, getGetApiKeyStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle } from "lucide-react";

const keysSchema = z.object({
  openaiKey: z.string().optional(),
  deepseekKey: z.string().optional(),
  claudeKey: z.string().optional(),
});

type KeysFormValues = z.infer<typeof keysSchema>;

export default function Settings() {
  const { data: status, isLoading } = useGetApiKeyStatus();
  const saveKeys = useSaveApiKeys();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<KeysFormValues>({
    resolver: zodResolver(keysSchema),
    defaultValues: {
      openaiKey: "",
      deepseekKey: "",
      claudeKey: "",
    },
  });

  function onSubmit(data: KeysFormValues) {
    saveKeys.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiKeyStatusQueryKey() });
        form.reset();
        toast({
          title: "API Keys Saved",
          description: "Your provider credentials have been updated securely.",
        });
      },
      onError: (err) => {
        toast({
          title: "Error saving keys",
          description: err.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Configure system settings and API credentials.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider API Keys</CardTitle>
          <CardDescription>
            API keys are required to run inference and judging pipelines. Keys are stored securely and never exposed to the frontend after saving.
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
                  <FormField
                    control={form.control}
                    name="openaiKey"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>OpenAI API Key</FormLabel>
                          {status?.openai ? (
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
                            placeholder={status?.openai ? "••••••••••••••••••••••••••••••••" : "sk-..."} 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deepseekKey"
                    render={({ field }) => (
                      <FormItem>
                         <div className="flex items-center justify-between">
                          <FormLabel>DeepSeek API Key</FormLabel>
                          {status?.deepseek ? (
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
                            placeholder={status?.deepseek ? "••••••••••••••••••••••••••••••••" : "sk-..."} 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="claudeKey"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Anthropic API Key (Claude)</FormLabel>
                          {status?.claude ? (
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
                            placeholder={status?.claude ? "••••••••••••••••••••••••••••••••" : "sk-ant-..."} 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="bg-muted/50 p-4 rounded-md text-sm text-muted-foreground">
                  Note: Providing a new key here will overwrite the existing one. Leave blank to keep existing keys unchanged.
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