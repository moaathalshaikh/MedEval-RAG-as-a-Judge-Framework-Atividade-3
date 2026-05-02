import { cn } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score?: number | null; className?: string }) {
  if (score == null) {
    return (
      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200", className)}>
        Unscored
      </span>
    );
  }

  const config = {
    1: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200", label: "1 — Critical" },
    2: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", label: "2 — Weak" },
    3: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", label: "3 — Partial" },
    4: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200", label: "4 — Good" },
    5: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", label: "5 — Excellent" },
  }[Math.floor(score) as 1 | 2 | 3 | 4 | 5];

  if (!config) {
    return (
      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600", className)}>
        {score}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", config.bg, config.text, config.border, className)}>
      {config.label}
    </span>
  );
}
