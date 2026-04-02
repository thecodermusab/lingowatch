import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { UserProfile, DifficultyLevel } from "@/types";

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("phrasepal_user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, _password: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    const profile: UserProfile = {
      id: crypto.randomUUID(),
      fullName: email.split("@")[0],
      email,
      preferredLanguage: "somali",
      englishLevel: "beginner",
      somaliModeEnabled: true,
      createdAt: new Date().toISOString(),
    };
    setUser(profile);
    localStorage.setItem("phrasepal_user", JSON.stringify(profile));
    setIsLoading(false);
  }, []);

  const signup = useCallback(async (email: string, _password: string, fullName: string) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    const profile: UserProfile = {
      id: crypto.randomUUID(),
      fullName,
      email,
      preferredLanguage: "somali",
      englishLevel: "beginner",
      somaliModeEnabled: true,
      createdAt: new Date().toISOString(),
    };
    setUser(profile);
    localStorage.setItem("phrasepal_user", JSON.stringify(profile));
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("phrasepal_user");
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem("phrasepal_user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
