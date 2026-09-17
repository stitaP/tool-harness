import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const Notebook = lazy(() => import("./pages/Notebook.tsx"));
const AgentStudio = lazy(() => import("./pages/AgentStudio.tsx"));
const Overview = lazy(() => import("./pages/Overview.tsx"));
const Downloads = lazy(() => import("./pages/Downloads.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Demo = lazy(() => import("./pages/Demo.tsx"));
const ApiDocs = lazy(() => import("./pages/ApiDocs.tsx"));
const Docs = lazy(() => import("./pages/Docs.tsx"));
const DocsPdf = lazy(() => import("./pages/DocsPdf.tsx"));
const ToolDocs = lazy(() => import("./pages/ToolDocs.tsx"));
const StartHere = lazy(() => import("./pages/StartHere.tsx"));
const ModulesPage = lazy(() => import("./pages/Modules.tsx"));
const Guide = lazy(() => import("./pages/Guide.tsx"));
const Tutorial = lazy(() => import("./pages/Tutorial.tsx"));
const Features = lazy(() => import("./pages/Features.tsx"));
const Help = lazy(() => import("./pages/Help.tsx"));
const Tools = lazy(() => import("./pages/Tools.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const VideoEditor = lazy(() => import("./pages/VideoEditor.tsx"));
const Recorder = lazy(() => import("./pages/Recorder.tsx"));
const Store = lazy(() => import("./pages/Store.tsx"));
const Agents = lazy(() => import("./pages/AgentPlatform.tsx"));
const Reports = lazy(() => import("./pages/Reports.tsx"));
const AgentConfig = lazy(() => import("./pages/AgentConfig.tsx"));
const Teamwork = lazy(() => import("./pages/Teamwork.tsx"));
const HarnessPlayground = lazy(() => import("./pages/HarnessPlayground.tsx"));
const PipeFlowDemo = lazy(() => import("./pages/PipeFlowDemo.tsx"));
const Tutorials = lazy(() => import("./pages/Tutorials.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/store" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <Settings />
                  </RequireAuth>
                }
              />
              <Route path="/demo" element={<Demo />} />
              <Route path="/editor" element={<VideoEditor />} />
              <Route path="/recorder" element={<Recorder />} />
              <Route path="/features" element={<Features />} />
              <Route path="/help" element={<Help />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/store" element={<Store />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/agent-config" element={<AgentConfig />} />
              <Route path="/playground" element={<HarnessPlayground />} />
              <Route path="/pipeflow" element={<PipeFlowDemo />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/teamwork" element={<Teamwork />} />
              <Route path="/notebook" element={<Notebook />} />
              <Route path="/studio" element={<AgentStudio />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/api" element={<ApiDocs />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/pdf" element={<DocsPdf />} />
              <Route path="/docs/start" element={<StartHere />} />
              <Route path="/docs/tools" element={<ToolDocs />} />
              <Route path="/modules" element={<ModulesPage />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/tutorial" element={<Tutorial />} />
              <Route path="/tutorials" element={<Tutorials />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
