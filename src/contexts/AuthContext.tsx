import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { UserProfile } from "@/types";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "lingowatch_user";
const LEGACY_STORAGE_KEY = "phrasepal_user";

function createDefaultProfile(): UserProfile {
  return {
    id: "local-user",
    fullName: "Learner",
    email: "local@phrasepal.app",
    preferredLanguage: "somali",
    englishLevel: "beginner",
    somaliModeEnabled: true,
    autoPlayAudioEnabled: false,
    preferredAiProvider: "gemini",
    createdAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let profile = createDefaultProfile();
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);

    if (stored) {
      try {
        profile = { ...profile, ...(JSON.parse(stored) as UserProfile) };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch {}
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }

    setUser(profile);
    setIsLoading(false);
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
