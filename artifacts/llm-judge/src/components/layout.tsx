import { Link, useLocation } from "wouter";
import {
  Activity,
  Database,
  Play,
  BarChart2,
  Settings,
  LayoutDashboard,
  Server,
  Upload,
  List,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/models", label: "SLM Models", icon: Server },
  { path: "/datasets", label: "Datasets", icon: Database },
  { path: "/import", label: "Import Responses", icon: Upload },
  { path: "/evaluate", label: "Evaluate", icon: Play },
  { path: "/results", label: "Results", icon: List },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

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

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              location === item.path ||
              (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                    isActive
                      ? "bg-accent text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">System Online</span>
          </div>
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
