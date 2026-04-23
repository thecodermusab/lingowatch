type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccounts = {
  id: {
    initialize: (options: {
      client_id: string;
      callback: (response: GoogleCredentialResponse) => void;
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
    }) => void;
    prompt: (listener?: (notification: unknown) => void) => void;
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: GoogleAccounts;
    };
  }
}

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_REDIRECT_NONCE_KEY = "lingowatch_google_redirect_nonce";
let googleScriptPromise: Promise<void> | null = null;

export function getGoogleClientId() {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
}

export function isGooglePromptDismissal(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return [
    "tap_outside",
    "user_cancel",
    "cancel_called",
    "dismissed",
    "suppressed_by_user",
    "skipped",
  ].some((reason) => message.includes(reason));
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Google sign-in")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export async function requestGoogleCredential() {
  return promptGoogleCredential();
}

export function startGoogleRedirectSignIn() {
  const clientId = getGoogleClientId();

  if (!clientId) {
    throw new Error("Add VITE_GOOGLE_CLIENT_ID to your .env file first.");
  }

  const nonce = crypto.randomUUID();
  sessionStorage.setItem(GOOGLE_REDIRECT_NONCE_KEY, nonce);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/login`,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    prompt: "select_account",
  });

  window.location.assign(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

export function consumeGoogleRedirectCredential() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const idToken = params.get("id_token");

  if (!idToken) return null;

  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  sessionStorage.removeItem(GOOGLE_REDIRECT_NONCE_KEY);
  return idToken;
}

export async function promptGoogleCredential() {
  const clientId = getGoogleClientId();

  if (!clientId) {
    throw new Error("Add VITE_GOOGLE_CLIENT_ID to your .env file first.");
  }

  await loadGoogleIdentityScript();

  return new Promise<string>((resolve, reject) => {
    const googleId = window.google?.accounts?.id;

    if (!googleId) {
      reject(new Error("Google sign-in is unavailable right now."));
      return;
    }

    googleId.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (response.credential) {
          resolve(response.credential);
        } else {
          reject(new Error("Google did not return a credential."));
        }
      },
    });

    googleId.prompt((notification) => {
      const result = notification as {
        isNotDisplayed?: () => boolean;
        isSkippedMoment?: () => boolean;
        getNotDisplayedReason?: () => string;
        getSkippedReason?: () => string;
      };

      if (result.isNotDisplayed?.()) {
        reject(new Error(result.getNotDisplayedReason?.() || "Google sign-in could not be shown."));
      }

      if (result.isSkippedMoment?.()) {
        reject(new Error(result.getSkippedReason?.() || "Google sign-in was skipped."));
      }
    });
  });
}
