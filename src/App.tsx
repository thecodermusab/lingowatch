import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppShell } from "@/components/layout/AppShell";

// Core pages — eager so they never show a spinner
import DashboardPage from "./pages/Dashboard";
import MediaPage from "./pages/media/MediaPage";
import WatchWorkspacePage from "./pages/WatchWorkspace";
import LibraryPage from "./pages/Library";
import PhraseDetailPage from "./pages/PhraseDetail";
import StoriesPage from "./pages/Stories";

// Less-visited pages — lazy loaded
const RandomPhrasesPage = lazy(() => import("./pages/RandomPhrases"));
const AddPhrasePage = lazy(() => import("./pages/AddPhrase"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const ReviewPage = lazy(() => import("./pages/Review"));
const ProgressPage = lazy(() => import("./pages/Progress"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const PodcastPlayerPage = lazy(() => import("./pages/media/PodcastPlayerPage"));
const BookReaderPage = lazy(() => import("./pages/reader/BookReaderPage"));
const ImportedTextReaderPage = lazy(() => import("./pages/reader/ImportedTextReaderPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

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

function AppRoutes() {
  const location = useLocation();
  const fullBleedRoutes = ["/watch", "/read", "/listen"];
  const isFullBleedRoute = fullBleedRoutes.some((route) => location.pathname.startsWith(route));

  const routes = (
    <Suspense fallback={<PageLoader />}>
      <ScrollToTop />
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
        <Route path="/media" element={<MediaPage />} />
        <Route path="/listen/:id" element={<PodcastPlayerPage />} />
        <Route path="/read/web/:id" element={<ImportedTextReaderPage />} />
        <Route path="/read/:id" element={<BookReaderPage />} />
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
