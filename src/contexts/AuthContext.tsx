import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { UserProfile } from "@/types";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => void;
  signInWithGoogleCredential: (credential: string) => Promise<UserProfile>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "lingowatch_user";
const LEGACY_STORAGE_KEY = "phrasepal_user";
const LOCAL_API_BASE_URL = "http://127.0.0.1:3001";

function createDefaultProfile(): UserProfile {
  return {
    id: "local-user",
    fullName: "Learner",
    email: "local@phrasepal.app",
    preferredLanguage: "somali",
    englishLevel: "beginner",
    somaliModeEnabled: true,
    autoPlayAudioEnabled: false,
    preferredAiProvider: "auto",
    createdAt: new Date().toISOString(),
  };
}

async function syncExtensionSession(user: UserProfile | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    window.postMessage({ type: "LINGOWATCH_EXTENSION_SESSION", payload: null }, "*");
    return;
  }

  try {
    const response = await fetch("/api/imported-texts/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
      }),
    });

    const session = await response.json().catch(() => null);
    if (!response.ok || !session?.token) return;

    window.postMessage({
      type: "LINGOWATCH_EXTENSION_SESSION",
      payload: {
        ...session,
        apiBaseUrl: LOCAL_API_BASE_URL,
        appBaseUrl: window.location.origin,
      },
    }, "*");
  } catch {
    // The extension bridge is optional; website auth should not fail if it is absent.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);

    if (stored) {
      try {
        const profile = { ...createDefaultProfile(), ...(JSON.parse(stored) as UserProfile) };
        if (!profile.id || profile.id === "local-user") {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          setUser(null);
          setIsLoading(false);
          return;
        }
        if (profile.preferredAiProvider === "gemini") {
          profile.preferredAiProvider = "auto";
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        setUser(profile);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        setUser(null);
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    void syncExtensionSession(user);
  }, [isLoading, user]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const signInWithGoogleCredential = useCallback(async (credential: string) => {
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.user) {
      throw new Error(data?.error || "Google sign-in failed");
    }

    const profile = { ...createDefaultProfile(), ...(data.user as UserProfile) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setUser(profile);
    return profile;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, updateProfile, signInWithGoogleCredential, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
