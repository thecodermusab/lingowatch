import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppShell } from "@/components/layout/AppShell";

const DashboardPage = lazy(() => import("./pages/Dashboard"));
const RandomPhrasesPage = lazy(() => import("./pages/RandomPhrases"));
const AddPhrasePage = lazy(() => import("./pages/AddPhrase"));
const LibraryPage = lazy(() => import("./pages/Library"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const PhraseDetailPage = lazy(() => import("./pages/PhraseDetail"));
const ReviewPage = lazy(() => import("./pages/Review"));
const ProgressPage = lazy(() => import("./pages/Progress"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const WatchWorkspacePage = lazy(() => import("./pages/WatchWorkspace"));
const StoriesPage = lazy(() => import("./pages/Stories"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="app-page">
      <div className="admin-panel admin-panel-body flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const fullBleedRoutes = ["/watch"];
  const isFullBleedRoute = fullBleedRoutes.some((route) => location.pathname.startsWith(route));

  const routes = (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/signup" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/random-phrases" element={<RandomPhrasesPage />} />
        <Route path="/add-phrase" element={<AddPhrasePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/phrase/:id" element={<PhraseDetailPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/watch" element={<WatchWorkspacePage />} />
        <Route path="/stories" element={<StoriesPage />} />
        <Route path="/stories/:id" element={<StoriesPage />} />
        <Route path="/stories/world/:worldId" element={<StoriesPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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
