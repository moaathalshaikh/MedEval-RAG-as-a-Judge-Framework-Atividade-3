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
  Crosshair,
  TerminalSquare
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Telemetry", icon: LayoutDashboard },
  { path: "/models", label: "SLM Registry", icon: Server },
  { path: "/datasets", label: "Corpus Management", icon: Database },
  { path: "/import", label: "Data Ingestion", icon: Upload },
  { path: "/evaluate", label: "Execute Pipeline", icon: Play },
  { path: "/results", label: "Inspection Log", icon: List },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/settings", label: "System Config", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.documentElement.classList.add("dark");
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/50 bg-card/30 backdrop-blur-md flex flex-col z-20 shrink-0 relative">
        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-border/10 via-border/50 to-border/10" />
        
        <div className="h-16 flex items-center px-6 border-b border-border/50 bg-muted/10 relative">
          <Crosshair className="h-5 w-5 text-primary mr-3" />
          <div className="flex flex-col">
            <h1 className="font-bold tracking-widest text-foreground uppercase text-sm leading-tight">
              MedEval<span className="text-primary font-light">Judge</span>
            </h1>
            <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase opacity-80">
              Clinical Benchmarking
            </span>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center px-3 py-2.5 text-xs font-mono tracking-widest uppercase transition-all group cursor-pointer border-l-2 relative overflow-hidden",
                    isActive 
                      ? "text-primary border-primary bg-primary/5" 
                      : "text-muted-foreground border-transparent hover:bg-muted/30 hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
                  )}
                  <item.icon 
                    className={cn(
                      "mr-3 h-4 w-4 flex-shrink-0 transition-colors relative z-10",
                      isActive ? "text-primary" : "text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground"
                    )} 
                  />
                  <span className="relative z-10">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-5 border-t border-border/50 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">Runtime</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              <span className="text-[9px] font-mono text-green-500 tracking-widest uppercase">Stable</span>
            </div>
          </div>
          <div className="mt-3 text-[9px] font-mono text-muted-foreground/50 tracking-widest uppercase break-all">
            SYS_ID: 0x8F9B2C<br />
            MEM: 42% / CPU: 12%
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative z-10">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] mix-blend-overlay" />
        
        <div className="flex-1 overflow-y-auto p-8 lg:p-12 relative z-10 custom-scrollbar">
          <div className="mx-auto max-w-[1400px] w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}