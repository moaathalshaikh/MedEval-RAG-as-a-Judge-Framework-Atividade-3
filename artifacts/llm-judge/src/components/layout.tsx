import { Link, useLocation } from "wouter";
import {
  Database,
  Play,
  BarChart2,
  Settings,
  LayoutDashboard,
  Server,
  Upload,
  List,
  Stethoscope,
  LogOut,
  Sparkles,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";
import { auth, firebaseSignOut } from "@/lib/firebase";
import { currentUnifiedUser } from "./auth-gate";

type NavGroup = {
  label: string;
  items: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; step?: number }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Setup",
    items: [
      { path: "/settings", label: "Settings", icon: Settings },
      { path: "/models", label: "SLM Models", icon: Server },
      { path: "/datasets", label: "Datasets", icon: Database },
    ],
  },
  {
    label: "Evaluation Pipeline",
    items: [
      { path: "/import", label: "Import Responses", icon: Upload, step: 1 },
      { path: "/reference-answers", label: "Reference Answers", icon: Sparkles, step: 2 },
      { path: "/evaluate", label: "Evaluate", icon: Play, step: 3 },
    ],
  },
  {
    label: "Analysis",
    items: [
      { path: "/results", label: "Results", icon: List },
      { path: "/analytics", label: "Analytics", icon: BarChart2 },
      { path: "/history", label: "History", icon: Clock },
    ],
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout: replitLogout } = useAuth();
  const user = currentUnifiedUser;

  async function handleLogout() {
    // Always delete API keys from DB first for security
    try {
      await fetch("/api/settings/api-keys", { method: "DELETE", credentials: "include" });
    } catch { /* proceed regardless */ }

    if (user?.provider === "firebase") {
      await fetch("/api/auth/firebase-logout", { method: "POST", credentials: "include" });
      await firebaseSignOut();
      window.location.href = "/";
    } else {
      replitLogout();
    }
  }

  const displayName = user?.displayName ?? null;
  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground leading-tight">MedEval Judge</p>
            <p className="text-[11px] text-muted-foreground">AI Evaluation System</p>
          </div>
        </div>

        {/* Welcome banner */}
        {user && (
          <div className="px-4 py-3 border-b border-border bg-accent/40">
            <p className="text-[11px] text-muted-foreground leading-none mb-1">Welcome back</p>
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location === item.path ||
                    (item.path !== "/" && location.startsWith(item.path));
                  return (
                    <Link key={item.path} href={item.path}>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                          isActive
                            ? "bg-accent text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {item.step != null ? (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0",
                              isActive
                                ? "bg-primary text-white"
                                : "bg-muted-foreground/20 text-muted-foreground"
                            )}
                          >
                            {item.step}
                          </span>
                        ) : (
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                        )}
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Developer credit */}
        <div className="px-4 py-2 text-center">
          <p className="text-[10px] text-muted-foreground/70">
            Developed by{" "}
            <a
              href="https://www.linkedin.com/in/moaathalshaikh/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary/80 hover:text-primary hover:underline font-bold transition-colors"
            >
              Moaath ALSHAIKH
            </a>
            {" "}& <span className="font-bold">Tasneem ALSHAHER</span>
          </p>
        </div>

        {/* Footer — user card + logout */}
        <div className="p-3 border-t border-border">
          {user ? (
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/60 group transition-colors">
              {user.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={displayName ?? ""}
                  className="w-7 h-7 rounded-full border border-border shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-[11px] shrink-0">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate leading-none mb-0.5">
                  {displayName}
                </p>
                {user.email && (
                  <p className="text-[10px] text-muted-foreground truncate leading-none">
                    {user.email}
                  </p>
                )}
              </div>
              <button
                onClick={handleLogout}
                title="Log out"
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">System Online</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px] w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
