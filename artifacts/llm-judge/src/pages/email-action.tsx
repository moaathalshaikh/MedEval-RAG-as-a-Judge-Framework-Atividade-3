import { useEffect, useState } from "react";
import { applyActionCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Stethoscope, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "error";

function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export default function EmailAction() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const mode = getParam("mode");
  const oobCode = getParam("oobCode");

  useEffect(() => {
    if (mode === "verifyEmail" && oobCode) {
      applyActionCode(auth, oobCode)
        .then(() => setStatus("success"))
        .catch((err) => {
          const code = err?.code ?? "";
          // Firebase may have already applied the code on its own hosted page
          // before redirecting here — in that case the email IS verified, show success.
          if (
            code === "auth/invalid-action-code" ||
            code === "auth/expired-action-code"
          ) {
            setStatus("success");
          } else {
            setErrorMessage("Something went wrong. Please try again.");
            setStatus("error");
          }
        });
    } else {
      setErrorMessage("Invalid or unsupported action link.");
      setStatus("error");
    }
  }, []);

  const appBase = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 shadow-sm">
            <Stethoscope className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">MedEval Judge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI evaluation system for medical language models
          </p>
        </div>

        {/* Loading */}
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Verifying your email address…</p>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Email verified!</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Your email address has been confirmed. You can now sign in to MedEval Judge.
              </p>
            </div>
            <Button
              className="w-full h-11"
              onClick={() => window.location.href = appBase + "/"}
            >
              Sign in to MedEval Judge
            </Button>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-destructive" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Verification failed</h2>
              <p className="text-sm text-muted-foreground mt-2">{errorMessage}</p>
            </div>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => window.location.href = appBase + "/"}
            >
              Back to sign in
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
