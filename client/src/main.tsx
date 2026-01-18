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

createRoot(document.getElementById("root")!).render(<App />);
