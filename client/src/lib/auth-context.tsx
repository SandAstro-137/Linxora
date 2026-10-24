import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@shared/schema";
import { saveAccountProfileIfRequested } from "./saved-accounts";

interface SuspensionInfo {
  suspendedUntil: string;
  reason: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  suspensionInfo: SuspensionInfo | null;
  login: (demoId: string) => Promise<void>;
  logout: () => void;
  refetchUser: () => Promise<void>;
  clearSuspension: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suspensionInfo, setSuspensionInfo] = useState<SuspensionInfo | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  // Keep presence fresh while a tab is open: heartbeat every minute.
  useEffect(() => {
    if (!user) return;
    const ping = () => {
      fetch("/api/heartbeat", { method: "POST", credentials: "include" }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const checkAuth = async () => {
    try {
      // no-store: profile edits (e.g. specialization) call refetchUser() right
      // after saving; without this the browser can satisfy the request from its
      // HTTP cache (304) and the UI keeps showing the old value until reload.
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        saveAccountProfileIfRequested(userData, sessionStorage.getItem("addAccountPending") === "true");
        sessionStorage.removeItem("addAccountPending");
        setSuspensionInfo(null);
        if (import.meta.env.DEV && sessionStorage.getItem("oauthTabAuthPending") === "true") {
          sessionStorage.setItem("tabUserId", userData.id);
          sessionStorage.removeItem("oauthTabAuthPending");
          window.dispatchEvent(new CustomEvent("demo-session-changed", { detail: true }));
        }
      } else if (response.status === 403) {
        const data = await response.json();
        if (data.accountStatus === "suspended") {
          setSuspensionInfo({
            suspendedUntil: data.suspendedUntil,
            reason: data.reason || null,
          });
          setUser(null);
        } else if (data.accountStatus === "banned") {
          setSuspensionInfo(null);
          setUser(null);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (demoId: string) => {
    try {
        const response = await fetch("/api/auth/dev-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discordId: demoId }),
          credentials: "include",
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          saveAccountProfileIfRequested(userData, sessionStorage.getItem("addAccountPending") === "true");
          sessionStorage.removeItem("addAccountPending");
          setSuspensionInfo(null);
          // Persist the selected account in this tab so it is restored after
          // refresh despite the browser-wide session cookie being shared.
          sessionStorage.setItem("tabUserId", userData.id);
          sessionStorage.setItem("demoUserId", demoId);
          window.dispatchEvent(new CustomEvent("demo-session-changed", { detail: true }));
          window.location.href = "/dashboard";
        } else if (response.status === 403) {
          const data = await response.json();
          if (data.accountStatus === "suspended") {
            setSuspensionInfo({
              suspendedUntil: data.suspendedUntil,
              reason: data.reason || null,
            });
            setUser(null);
          }
        }
      } catch (error) {
        console.error("Login failed:", error);
      }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      sessionStorage.removeItem("tabUserId");
      sessionStorage.removeItem("demoUserId");
      sessionStorage.removeItem("addAccountPending");
      sessionStorage.removeItem("oauthPending");
      window.dispatchEvent(new CustomEvent("demo-session-changed", { detail: false }));
      setUser(null);
      setSuspensionInfo(null);
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const clearSuspension = () => {
    setSuspensionInfo(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, suspensionInfo, login, logout, refetchUser: checkAuth, clearSuspension }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
