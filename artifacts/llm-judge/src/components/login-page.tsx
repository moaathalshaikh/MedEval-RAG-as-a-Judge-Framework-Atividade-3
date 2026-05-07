import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resendVerificationEmail, sendPasswordReset } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stethoscope, Mail, Eye, EyeOff, AlertCircle, MailCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "choose" | "signin" | "signup" | "verify-email" | "forgot-password";

export function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function clearForm() {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setResendSuccess(false);
    setResetSent(false);
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "";
      if (msg === "__open_new_tab__") {
        setError("Google sign-in opened in a new tab. Complete sign-in there, then return here and refresh.");
      } else {
        setError(getFirebaseError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/email-not-verified") {
        // Keep email/password in state so user can resend
        setMode("verify-email");
      } else {
        setError(getFirebaseError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password);
      // Go to verify-email screen (keep email/password for resend)
      setConfirmPassword("");
      setMode("verify-email");
    } catch (e: unknown) {
      setError(getFirebaseError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    setResetSent(false);
    try {
      await sendPasswordReset(email);
      setResetSent(true);
    } catch (e: unknown) {
      setError(getFirebaseError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    setResendSuccess(false);
    try {
      await resendVerificationEmail(email, password);
      setResendSuccess(true);
    } catch (e: unknown) {
      setError(getFirebaseError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 shadow-sm">
            <Stethoscope className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">MedEval Judge</h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            AI evaluation system for medical language models
          </p>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mb-6">
          Developed by{" "}
          <a
            href="https://www.linkedin.com/in/moaathalshaikh/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-bold"
          >
            Moaath ALSHAIKH
          </a>
          {" "}& <span className="font-bold">Tasneem ALSHAHER</span>
        </p>

        <AnimatePresence mode="wait">
          {/* ── CHOOSE MODE ─────────────────────────────── */}
          {mode === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <Button
                variant="outline"
                className="w-full h-11 text-sm font-medium gap-2.5"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>

              <Button
                variant="outline"
                className="w-full h-11 text-sm font-medium gap-2.5"
                onClick={() => { clearForm(); setMode("signin"); }}
              >
                <Mail className="w-4 h-4" />
                Sign in with Email
              </Button>

              <p className="text-center text-xs text-muted-foreground pt-1">
                Don't have an account?{" "}
                <button
                  className="text-primary hover:underline font-medium"
                  onClick={() => { clearForm(); setMode("signup"); }}
                >
                  Create one
                </button>
              </p>
            </motion.div>
          )}

          {/* ── SIGN IN ─────────────────────────────────── */}
          {mode === "signin" && (
            <motion.form
              key="signin"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleEmailSignIn}
              className="space-y-3"
            >
              <h2 className="text-lg font-semibold text-foreground mb-1">Sign in</h2>

              {error && <ErrorBanner message={error} />}

              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  placeholder="Password"
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <button type="button" className="hover:text-foreground" onClick={() => { clearForm(); setMode("choose"); }}>
                  ← Back
                </button>
                <button type="button" className="text-primary hover:underline" onClick={() => { setError(null); setMode("forgot-password"); }}>
                  Forgot password?
                </button>
              </div>
            </motion.form>
          )}

          {/* ── SIGN UP ─────────────────────────────────── */}
          {mode === "signup" && (
            <motion.form
              key="signup"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleEmailSignUp}
              className="space-y-3"
            >
              <h2 className="text-lg font-semibold text-foreground mb-1">Create account</h2>

              {error && <ErrorBanner message={error} />}

              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  placeholder="Password (min. 6 characters)"
                />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <button type="button" className="hover:text-foreground" onClick={() => { clearForm(); setMode("choose"); }}>
                  ← Back
                </button>
                <button type="button" className="text-primary hover:underline" onClick={() => { clearForm(); setMode("signin"); }}>
                  Already have an account?
                </button>
              </div>
            </motion.form>
          )}

          {/* ── VERIFY EMAIL ─────────────────────────────── */}
          {mode === "verify-email" && (
            <motion.div
              key="verify-email"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4 text-center"
            >
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <MailCheck className="w-8 h-8 text-primary" />
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">Check your email</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a verification link to
                </p>
                <p className="text-sm font-medium text-foreground mt-0.5">{email}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Click the link in the email to verify your account, then come back and sign in.
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              {resendSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-left">
                  <MailCheck className="h-4 w-4 text-green-600 shrink-0" />
                  <p className="text-xs text-green-700">Verification email resent successfully.</p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  className="w-full h-11"
                  onClick={() => { setError(null); setMode("signin"); }}
                >
                  I've verified my email — Sign in
                </Button>

                <Button
                  variant="outline"
                  className="w-full h-10 text-sm"
                  onClick={handleResendVerification}
                  disabled={loading || !email || !password}
                >
                  {loading ? "Sending…" : "Resend verification email"}
                </Button>
              </div>

              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { clearForm(); setMode("choose"); }}
              >
                ← Back to login
              </button>
            </motion.div>
          )}

          {/* ── FORGOT PASSWORD ──────────────────────────── */}
          {mode === "forgot-password" && (
            <motion.form
              key="forgot-password"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleForgotPassword}
              className="space-y-3"
            >
              <h2 className="text-lg font-semibold text-foreground mb-1">Reset password</h2>
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              {error && <ErrorBanner message={error} />}

              {resetSent ? (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-3 text-left">
                  <MailCheck className="h-4 w-4 text-green-600 shrink-0" />
                  <p className="text-xs text-green-700">
                    Reset link sent! Check your inbox (and spam folder).
                  </p>
                </div>
              ) : (
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              )}

              {!resetSent && (
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <button type="button" className="hover:text-foreground" onClick={() => { clearForm(); setMode("signin"); }}>
                  ← Back to sign in
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder ?? "Password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="current-password"
        required
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <p className="text-xs text-destructive leading-relaxed">{message}</p>
    </div>
  );
}

function getFirebaseError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/email-already-in-use": "This email is already registered. Try signing in instead.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-not-verified": "Please verify your email before signing in.",
    "auth/popup-closed-by-user": "Sign-in popup was closed. Please try again.",
    "auth/popup-blocked": "Popup was blocked. Please allow popups and try again.",
    "auth/too-many-requests": "Too many failed attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Please check your connection.",
  };
  return map[code] ?? "An error occurred. Please try again.";
}
