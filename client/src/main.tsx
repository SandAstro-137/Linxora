import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress WebSocket connection errors (Vite HMR in Replit environment)
// Must be added early to catch Vite client errors
window.addEventListener('error', (event) => {
  if (event.message?.includes('WebSocket') || 
      event.message?.includes('wss://localhost') ||
      event.message?.includes('localhost:undefined')) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('WebSocket') || 
      event.reason?.message?.includes('wss://localhost') ||
      event.reason?.message?.includes('localhost:undefined')) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
}, true);


// Dev/demo: per-tab demo identity. The session cookie is shared across all tabs
// of a browser, so this tab sends its chosen demo account (remembered in
// sessionStorage) on every request; the server honors it in development. This
// lets you run two different demo accounts in two tabs at the same time.
if (import.meta.env.DEV) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const demoId = sessionStorage.getItem("demoUserId");
    if (demoId) {
      const headers = new Headers(init?.headers);
      headers.set("X-Demo-User", demoId);
      init = { ...init, headers };
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

createRoot(document.getElementById("root")!).render(<App />);
