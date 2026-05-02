import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score?: number | null, className?: string }) {
  if (score == null) return <Badge variant="outline" className={cn("rounded-none font-mono text-[10px] tracking-widest bg-muted/30", className)}>UNSCORED</Badge>;

  const config = {
    1: { color: "bg-destructive/10 text-destructive border-destructive/30", label: "1.0 CRITICAL" },
    2: { color: "bg-orange-500/10 text-orange-500 border-orange-500/30", label: "2.0 WEAK" },
    3: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", label: "3.0 PARTIAL" },
    4: { color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/30", label: "4.0 GOOD" },
    5: { color: "bg-green-500/10 text-green-500 border-green-500/30", label: "5.0 EXCELLENT" },
  }[Math.floor(score) as 1|2|3|4|5];

  if (!config) return <Badge variant="outline" className={cn("rounded-none font-mono text-[10px] tracking-widest", className)}>{score}</Badge>;

  return (
    <Badge variant="outline" className={cn("rounded-none font-mono text-[10px] tracking-widest uppercase border", config.color, className)}>
      {config.label}
    </Badge>
  );
}
