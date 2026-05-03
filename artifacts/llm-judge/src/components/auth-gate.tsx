import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-3/4 mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-sm px-6">
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.5l-1.25 4.375A2.25 2.25 0 0116.4 21H7.6a2.25 2.25 0 01-2.15-1.625L4.2 15m15.6 0H4.2" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">MedEval Judge</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI evaluation system for medical language models. Sign in to access your private workspace.
            </p>
          </div>
          <Button onClick={login} className="w-full h-10 text-sm font-medium">
            Log in to continue
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
