import { createClient } from "@base44/sdk";

// Vite exposes VITE_* env vars via import.meta.env (injected at build time)
export const base44 = createClient({
  appId: import.meta.env.VITE_BASE44_APP_ID,
  serverUrl: import.meta.env.VITE_BASE44_BACKEND_URL || "https://base44.app",
});