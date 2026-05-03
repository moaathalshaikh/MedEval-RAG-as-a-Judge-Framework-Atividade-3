import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/** Returns true if the app is running inside an iframe */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Sign in with Google.
 * - If NOT in an iframe: uses signInWithPopup (best UX).
 * - If in an iframe (e.g. Replit workspace preview): tries popup; if blocked, opens new tab.
 */
export async function signInWithGoogle(): Promise<User> {
  if (!isInIframe()) {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  }

  return new Promise((resolve, reject) => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then((result) => resolve(result.user))
      .catch(async (err) => {
        if (
          err?.code === "auth/popup-blocked" ||
          err?.code === "auth/cancelled-popup-request"
        ) {
          const target = window.top ?? window;
          const appUrl =
            window.location.protocol +
            "//" +
            window.location.host +
            (import.meta.env.BASE_URL ?? "/");
          target.open(appUrl, "_blank");
          reject(new Error("__open_new_tab__"));
        } else {
          reject(err);
        }
      });
  });
}

/**
 * Sign in with email/password.
 * Throws auth/email-not-verified (custom) if account exists but email not verified.
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  if (!result.user.emailVerified) {
    // Sign out immediately — don't allow unverified users in
    await signOut(auth);
    throw { code: "auth/email-not-verified" };
  }
  return result.user;
}

/** Build ActionCodeSettings pointing to our branded /auth/action handler */
function getActionCodeSettings() {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return {
    url: `${window.location.origin}${base}/auth/action`,
    handleCodeInApp: true,
  };
}

/**
 * Register with email/password and send verification email.
 * Does NOT sign the user into the app — they must verify first.
 */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(result.user, getActionCodeSettings());
  // Sign out immediately — user must verify email before accessing the app
  await signOut(auth);
}

/** Resend verification email to the currently signed-in (unverified) user */
export async function resendVerificationEmail(email: string, password: string): Promise<void> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(result.user, getActionCodeSettings());
  await signOut(auth);
}

export async function firebaseSignOut(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };
