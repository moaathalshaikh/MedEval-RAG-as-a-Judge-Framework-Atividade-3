import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { auth, onAuthStateChanged, type User as FirebaseUser } from "@/lib/firebase";
import { LoginPage } from "./login-page";

interface AuthGateProps {
  children: React.ReactNode;
}

export type AuthProvider = "replit" | "firebase";

export interface UnifiedUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  provider: AuthProvider;
  displayName: string;
}

// Shared context so children can read the user
export let currentUnifiedUser: UnifiedUser | null = null;

async function exchangeFirebaseToken(fbUser: FirebaseUser): Promise<boolean> {
  try {
    const token = await fbUser.getIdToken();
    const res = await fetch("/api/auth/firebase-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken: token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function AuthGate({ children }: AuthGateProps) {
  const { isLoading: replitLoading, isAuthenticated: replitAuthed, user: replitUser } = useAuth();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [firebaseSessionOk, setFirebaseSessionOk] = useState(false);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const ok = await exchangeFirebaseToken(fbUser);
        setFirebaseSessionOk(ok);
      } else {
        setFirebaseSessionOk(false);
      }
      setFirebaseLoading(false);
    });
    return unsub;
  }, []);

  const isLoading = replitLoading || firebaseLoading;
  const isAuthenticated = replitAuthed || firebaseSessionOk;

  // Build unified user object
  if (replitAuthed && replitUser) {
    currentUnifiedUser = {
      id: replitUser.id,
      email: replitUser.email,
      firstName: replitUser.firstName,
      lastName: replitUser.lastName,
      profileImageUrl: replitUser.profileImageUrl,
      provider: "replit",
      displayName: replitUser.firstName
        ? `${replitUser.firstName}${replitUser.lastName ? " " + replitUser.lastName : ""}`
        : replitUser.email ?? "User",
    };
  } else if (firebaseSessionOk && firebaseUser) {
    const name = firebaseUser.displayName ?? firebaseUser.email ?? "User";
    const parts = name.split(" ");
    currentUnifiedUser = {
      id: `firebase:${firebaseUser.uid}`,
      email: firebaseUser.email,
      firstName: parts[0] ?? null,
      lastName: parts.slice(1).join(" ") || null,
      profileImageUrl: firebaseUser.photoURL,
      provider: "firebase",
      displayName: name,
    };
  } else {
    currentUnifiedUser = null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
