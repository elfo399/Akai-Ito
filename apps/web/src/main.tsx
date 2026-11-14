import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth";
import { Layout, Loading, ErrorState } from "./components";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-600.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "./style.css";
import "./scrapbook.css";
import "./world.css";
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const Timeline = lazy(() => import("./pages/Timeline"));
const Editor = lazy(() => import("./pages/Editor"));
const Detail = lazy(() => import("./pages/Detail"));
const Albums = lazy(() => import("./pages/Albums"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Trash = lazy(() => import("./pages/Trash"));
const World = lazy(() => import("./pages/World"));
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true },
  },
});
function App() {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (error)
    return <ErrorState error={new Error(error)} retry={() => void refresh()} />;
  return (
    <Suspense fallback={<Loading />}>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="*"
            element={
              <Navigate
                to="/login"
                state={{ from: location.pathname }}
                replace
              />
            }
          />
        </Routes>
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/world" element={<World />} />
            <Route path="/memories/new" element={<Editor />} />
            <Route path="/memories/:id/edit" element={<Editor />} />
            <Route path="/memories/:id" element={<Detail />} />
            <Route path="/albums/:category?" element={<Albums />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Questa pagina non è nel diario.</h1>
                  <a href="/">Torna alla copertina</a>
                </div>
              }
            />
          </Routes>
        </Layout>
      )}
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
