import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { UserProfile } from "@/types";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => void;
  signInWithGoogleCredential: (credential: string) => Promise<UserProfile>;
  signInWithEmail: (email: string, password: string) => Promise<UserProfile>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<UserProfile>;
  completeOnboarding: (updates: Partial<UserProfile>) => Promise<UserProfile>;
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
    onboardingCompleted: true,
    emailVerified: false,
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

async function persistProfile(userId: string, fullName: string, updates: Partial<UserProfile>) {
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      fullName,
      onboardingCompleted: updates.onboardingCompleted,
      updates,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.user) {
    throw new Error(data?.error || "Could not update profile");
  }
  return { ...createDefaultProfile(), ...(data.user as UserProfile) };
}

function storeProfile(profile: UserProfile, setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  setUser(profile);
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
      void persistProfile(prev.id, updated.fullName, updates)
        .then((serverProfile) => {
          storeProfile(serverProfile, setUser);
        })
        .catch(() => {});
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
    storeProfile(profile, setUser);
    return profile;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.user) {
      throw new Error(data?.error || "Login failed");
    }

    const profile = { ...createDefaultProfile(), ...(data.user as UserProfile) };
    storeProfile(profile, setUser);
    return profile;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, fullName = "") => {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.user) {
      throw new Error(data?.error || "Sign up failed");
    }

    const profile = { ...createDefaultProfile(), ...(data.user as UserProfile) };
    storeProfile(profile, setUser);
    return profile;
  }, []);

  const completeOnboarding = useCallback(async (updates: Partial<UserProfile>) => {
    if (!user) {
      throw new Error("No active user");
    }

    const profile = await persistProfile(user.id, updates.fullName || user.fullName, {
      ...updates,
      onboardingCompleted: true,
    });
    storeProfile(profile, setUser);
    return profile;
  }, [user]);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        updateProfile,
        signInWithGoogleCredential,
        signInWithEmail,
        signUpWithEmail,
        completeOnboarding,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
