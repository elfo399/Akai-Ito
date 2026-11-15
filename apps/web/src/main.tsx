import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
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
import "./immersive.css";
import "./refinements.css";
import "./diary-navigation.css";
import { MotionProvider, RouteViewport } from "./motion";
import Detail from "./pages/Detail";
import Timeline from "./pages/Timeline";
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const Editor = lazy(() => import("./pages/Editor"));
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
  if (!user)
    return location.pathname === "/login" ? (
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    ) : (
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    );
  if (location.pathname === "/login") return <Navigate to="/" replace />;
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}
function MemoryPage() {
  const location = useLocation();
  return <Detail key={location.pathname} />;
}
const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthProvider>
        <MotionProvider>
          <RouteViewport />
          <App />
        </MotionProvider>
      </AuthProvider>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "timeline", element: <Timeline /> },
      { path: "world", element: <World /> },
      { path: "memories/new", element: <Editor /> },
      { path: "memories/:id/edit", element: <Editor /> },
      { path: "memories/:id", element: <MemoryPage /> },
      { path: "albums/:category?", element: <Albums /> },
      { path: "albums/:category/:collectionId", element: <Albums /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "trash", element: <Trash /> },
      {
        path: "*",
        element: (
          <div className="empty">
            <h1>Questa pagina non è nel diario.</h1>
            <a href="/">Torna alla copertina</a>
          </div>
        ),
      },
    ],
  },
]);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
