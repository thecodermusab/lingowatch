import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppShell } from "@/components/layout/AppShell";

// Core pages — eager so they never show a spinner
import DashboardPage from "./pages/learning/Dashboard";
import MediaPage from "./pages/media/MediaPage";
import WatchWorkspacePage from "./pages/workspace/WatchWorkspace";
import LibraryPage from "./pages/workspace/Library";
import PhraseDetailPage from "./pages/workspace/PhraseDetail";
import StoriesPage from "./pages/workspace/Stories";
import LandingPage from "./pages/public/Landing";
import SettingsPage from "./pages/workspace/Settings";
import RandomPhrasesPage from "./pages/learning/RandomPhrases";
import LoginPage from "./pages/auth/Login";
import SignupPage from "./pages/auth/Signup";
import OnboardingPage from "./pages/auth/Onboarding";
import VerifyEmailPage from "./pages/auth/VerifyEmail";
import ForgotPasswordPage from "./pages/auth/ForgotPassword";
import PrivacyPage from "./pages/public/Privacy";
import AdminAnnouncementsPage from "./pages/admin/AdminAnnouncements";
import AddPhrasePage from "./pages/learning/AddPhrase";
import ReviewPage from "./pages/learning/Review";
import ProgressPage from "./pages/learning/Progress";
import PodcastPlayerPage from "./pages/media/PodcastPlayerPage";
import BookReaderPage from "./pages/reader/BookReaderPage";
import ImportedTextReaderPage from "./pages/reader/ImportedTextReaderPage";
import NotFound from "./pages/public/NotFound";

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user.onboardingCompleted && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

function AppRoutes() {
  const location = useLocation();
  const noShellRoutes = ["/", "/login", "/signup", "/onboarding", "/verify-email", "/forgot-password", "/privacy"];
  const fullBleedRoutes = ["/watch", "/read", "/listen"];
  const isFullBleedRoute = noShellRoutes.includes(location.pathname) ||
    fullBleedRoutes.some((route) => location.pathname.startsWith(route));

  const routes = (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/admin/announcements" element={<RequireAuth><AdminAnnouncementsPage /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/random-phrases" element={<RequireAuth><RandomPhrasesPage /></RequireAuth>} />
        <Route path="/add-phrase" element={<RequireAuth><AddPhrasePage /></RequireAuth>} />
        <Route path="/library" element={<RequireAuth><LibraryPage /></RequireAuth>} />
        <Route path="/phrase/:id" element={<RequireAuth><PhraseDetailPage /></RequireAuth>} />
        <Route path="/review" element={<RequireAuth><ReviewPage /></RequireAuth>} />
        <Route path="/progress" element={<RequireAuth><ProgressPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/watch" element={<RequireAuth><WatchWorkspacePage /></RequireAuth>} />
        <Route path="/stories" element={<RequireAuth><StoriesPage /></RequireAuth>} />
        <Route path="/stories/:id" element={<RequireAuth><StoriesPage /></RequireAuth>} />
        <Route path="/stories/world/:worldId" element={<RequireAuth><StoriesPage /></RequireAuth>} />
        <Route path="/media" element={<RequireAuth><MediaPage /></RequireAuth>} />
        <Route path="/listen/:id" element={<RequireAuth><PodcastPlayerPage /></RequireAuth>} />
        <Route path="/read/web/:id" element={<RequireAuth><ImportedTextReaderPage /></RequireAuth>} />
        <Route path="/read/:id" element={<RequireAuth><BookReaderPage /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );

  if (isFullBleedRoute) {
    return routes;
  }

  return <AppShell>{routes}</AppShell>;
}

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
