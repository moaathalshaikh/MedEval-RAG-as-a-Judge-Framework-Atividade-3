import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { logger } from "./logger";

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("VITE_FIREBASE_PROJECT_ID env var not set");
  }

  // Use application default credentials (works without service account key
  // by using Firebase's public JWKS endpoint for ID token verification)
  adminApp = initializeApp({ projectId });
  return adminApp;
}

export async function generatePasswordResetLink(email: string, continueUrl: string): Promise<string> {
  const app = getAdminApp();
  return getAuth(app).generatePasswordResetLink(email, { url: continueUrl });
}

export async function verifyFirebaseToken(idToken: string): Promise<{
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
} | null> {
  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);

    // Reject unverified email accounts (Google users are always verified)
    const isGoogle = decoded.firebase?.sign_in_provider === "google.com";
    if (!isGoogle && !decoded.email_verified) {
      logger.warn({ uid: decoded.uid }, "Firebase token rejected: email not verified");
      return null;
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string) ?? null,
      picture: (decoded.picture as string) ?? null,
    };
  } catch (e) {
    logger.warn({ error: String(e) }, "Firebase token verification failed");
    return null;
  }
}
