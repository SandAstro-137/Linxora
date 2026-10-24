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


// OAuth navigation returns to this page without sharing JavaScript state.
// Clear demo overrides on return so they cannot replace the provider identity.
if (sessionStorage.getItem("oauthPending") === "true" && sessionStorage.getItem("addAccountPending") !== "true") {
  sessionStorage.removeItem("oauthPending");
  sessionStorage.removeItem("tabUserId");
  sessionStorage.removeItem("demoUserId");
}

// Dev/demo: send a per-tab identity only when this tab selected a dev account.
if (import.meta.env.DEV) {
  const originalFetch = window.fetch.bind(window);
  let isDemoSession = sessionStorage.getItem("tabUserId") !== null;
  const syncDemoSession = (event: Event) => {
    isDemoSession = (event as CustomEvent<boolean>).detail === true;
  };
  window.addEventListener("demo-session-changed", syncDemoSession);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const tabUserId = isDemoSession ? sessionStorage.getItem("tabUserId") : null;
    if (tabUserId) {
      const headers = new Headers(init?.headers);
      headers.set("X-Tab-User", tabUserId);
      init = { ...init, headers };
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

createRoot(document.getElementById("root")!).render(<App />);
