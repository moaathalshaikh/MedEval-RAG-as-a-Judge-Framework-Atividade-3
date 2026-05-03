import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
 * - If in an iframe (e.g. Replit workspace preview): opens a small auth window
 *   outside the iframe so Google's X-Frame-Options doesn't block it.
 */
export async function signInWithGoogle(): Promise<User> {
  if (!isInIframe()) {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  }

  // Inside iframe — open auth in a top-level popup window
  return new Promise((resolve, reject) => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then((result) => resolve(result.user))
      .catch(async (err) => {
        // popup-blocked inside iframe → guide user to open app directly
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

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function firebaseSignOut(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };
