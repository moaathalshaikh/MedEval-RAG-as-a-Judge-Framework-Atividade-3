import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, PlusCircle, Pencil, Trash2, Upload, Play, Eraser, Database, Server, RefreshCw } from "lucide-react";

interface LogEntry {
  id: number;
  action: string;
  entityType: string | null;
  entityName: string | null;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  details: string | null;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  ADD_MODEL:            { label: "Add Model",           color: "text-green-700",  bg: "bg-green-100",  icon: PlusCircle },
  RENAME_MODEL:         { label: "Rename Model",        color: "text-yellow-700", bg: "bg-yellow-100", icon: Pencil },
  DELETE_MODEL:         { label: "Delete Model",        color: "text-red-700",    bg: "bg-red-100",    icon: Trash2 },
  ADD_DATASET:          { label: "Add Dataset",         color: "text-green-700",  bg: "bg-green-100",  icon: PlusCircle },
  RENAME_DATASET:       { label: "Rename Dataset",      color: "text-yellow-700", bg: "bg-yellow-100", icon: Pencil },
  DELETE_DATASET:       { label: "Delete Dataset",      color: "text-red-700",    bg: "bg-red-100",    icon: Trash2 },
  UPLOAD_QUESTIONS:     { label: "Upload Questions",    color: "text-blue-700",   bg: "bg-blue-100",   icon: Database },
  IMPORT_RESPONSES:     { label: "Import Responses",    color: "text-blue-700",   bg: "bg-blue-100",   icon: Upload },
  DELETE_RESPONSE:      { label: "Delete Response",     color: "text-red-700",    bg: "bg-red-100",    icon: Trash2 },
  CLEAR_ALL_RESULTS:    { label: "Clear All Results",   color: "text-red-700",    bg: "bg-red-100",    icon: Eraser },
  RUN_EVALUATION:       { label: "Run Evaluation",      color: "text-primary",    bg: "bg-primary/10", icon: Play },
  DELETE_EVALUATION:    { label: "Clear Evaluation",    color: "text-amber-700",  bg: "bg-amber-100",  icon: RefreshCw },
  GEN_REFERENCE:        { label: "Gen. References",     color: "text-purple-700", bg: "bg-purple-100", icon: Server },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, color: "text-muted-foreground", bg: "bg-muted", icon: Activity };
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function getAvatarBg(email: string): string {
  const colors = ["bg-primary/20", "bg-blue-200", "bg-purple-200", "bg-amber-200", "bg-green-200", "bg-pink-200"];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function History() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/activity-log")
      .then((r) => r.json())
      .then((data) => { setEntries(Array.isArray(data) ? data : []); })
      .catch(() => setEntries([]))
      .finally(() => setIsLoading(false));
  }, []);

  const actionTypes = [...new Set(entries.map((e) => e.action))].sort();
  const filtered = filter === "all" ? entries : entries.filter((e) => e.action === filter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full audit trail of all actions performed in the system
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionTypes.map((a) => (
              <SelectItem key={a} value={a}>{getActionMeta(a).label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats bar */}
      {!isLoading && entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(
            entries.reduce((acc, e) => { acc[e.action] = (acc[e.action] ?? 0) + 1; return acc; }, {} as Record<string, number>)
          ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([action, count]) => {
            const meta = getActionMeta(action);
            return (
              <button
                key={action}
                onClick={() => setFilter(filter === action ? "all" : action)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  filter === action
                    ? `${meta.bg} ${meta.color} border-current`
                    : "bg-muted/50 text-muted-foreground border-border hover:border-muted-foreground/40"
                }`}
              >
                <meta.icon className="h-3 w-3" />
                {meta.label}
                <span className="font-bold">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <Activity className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {filter === "all" ? "No activity recorded yet. Start using the system to see logs here." : "No entries for this action type."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((entry, i) => {
                const meta = getActionMeta(entry.action);
                const Icon = meta.icon;
                const initials = getInitials(entry.userName, entry.userEmail);
                const avatarBg = getAvatarBg(entry.userEmail);

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(i * 0.03, 0.3) }}
                    className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Action icon */}
                    <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0.5 font-semibold ${meta.color} border-current/30 ${meta.bg}`}
                          >
                            {meta.label}
                          </Badge>
                          {entry.entityName && (
                            <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                              {entry.entityName}
                            </span>
                          )}
                        </div>
                        <span
                          className="text-xs text-muted-foreground shrink-0 whitespace-nowrap"
                          title={formatAbsolute(entry.createdAt)}
                        >
                          {formatRelative(entry.createdAt)}
                        </span>
                      </div>

                      {entry.details && (
                        <p className="text-sm text-muted-foreground mt-1 leading-snug">{entry.details}</p>
                      )}

                      {/* User info */}
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className={`w-5 h-5 rounded-full ${avatarBg} flex items-center justify-center text-[9px] font-bold text-foreground shrink-0`}>
                          {initials}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {entry.userName ? (
                            <><span className="font-medium text-foreground">{entry.userName}</span> · {entry.userEmail}</>
                          ) : (
                            entry.userEmail
                          )}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
