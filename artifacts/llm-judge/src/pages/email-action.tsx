import { useEffect, useState } from "react";
import { applyActionCode } from "firebase/auth";
import { auth, completePasswordReset } from "@/lib/firebase";
import { Stethoscope, CheckCircle2, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "loading" | "success" | "password-reset-done" | "error" | "reset-form" | "reset-success";

function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export default function EmailAction() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Reset-password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const mode = getParam("mode");
  const oobCode = getParam("oobCode");
  const flow = getParam("flow");

  useEffect(() => {
    if (mode === "verifyEmail" && oobCode) {
      applyActionCode(auth, oobCode)
        .then(() => setStatus("success"))
        .catch((err) => {
          const code = err?.code ?? "";
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
    } else if (mode === "resetPassword" && oobCode) {
      setStatus("reset-form");
    } else if (!mode && !oobCode) {
      // Firebase redirect after processing on its own page.
      // Use the flow param to show the right success screen.
      if (flow === "password-reset") {
        setStatus("password-reset-done");
      } else {
        setStatus("success");
      }
    } else {
      setErrorMessage("Invalid or unsupported action link.");
      setStatus("error");
    }
  }, []);

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!oobCode) return;
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      await completePasswordReset(oobCode, newPassword);
      setStatus("reset-success");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setResetError("This reset link has expired. Please request a new one.");
      } else if (code === "auth/weak-password") {
        setResetError("Password must be at least 6 characters.");
      } else {
        setResetError("Something went wrong. Please try again.");
      }
    } finally {
      setResetLoading(false);
    }
  }

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
            <p className="text-sm text-muted-foreground">Processing…</p>
          </div>
        )}

        {/* Email verified — success */}
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
            <Button className="w-full h-11" onClick={() => window.location.href = appBase + "/"}>
              Sign in to MedEval Judge
            </Button>
          </div>
        )}

        {/* Password reset done — Firebase handled it, redirect to sign in */}
        {status === "password-reset-done" && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Password updated!</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Your password has been changed successfully. You can now sign in with your new password.
              </p>
            </div>
            <Button className="w-full h-11" onClick={() => window.location.href = appBase + "/"}>
              Sign in to MedEval Judge
            </Button>
          </div>
        )}

        {/* Reset password — form */}
        {status === "reset-form" && (
          <form onSubmit={handlePasswordReset} className="space-y-4 text-left">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Set new password</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a strong password for your account.
              </p>
            </div>

            {resetError && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive leading-relaxed">{resetError}</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password (min. 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full h-11" disabled={resetLoading}>
              {resetLoading ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}

        {/* Reset password — success */}
        {status === "reset-success" && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Password updated!</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Your password has been changed successfully. You can now sign in.
              </p>
            </div>
            <Button className="w-full h-11" onClick={() => window.location.href = appBase + "/"}>
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
              <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground mt-2">{errorMessage}</p>
            </div>
            <Button variant="outline" className="w-full h-11" onClick={() => window.location.href = appBase + "/"}>
              Back to sign in
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
