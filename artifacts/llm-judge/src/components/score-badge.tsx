import { Badge } from "@/components/ui/badge";

export function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <Badge variant="outline">Unscored</Badge>;

  const config = {
    1: { color: "bg-red-500 hover:bg-red-600 text-white", label: "1 - Critical Error" },
    2: { color: "bg-orange-500 hover:bg-orange-600 text-white", label: "2 - Weak" },
    3: { color: "bg-yellow-500 hover:bg-yellow-600 text-white", label: "3 - Partial" },
    4: { color: "bg-cyan-500 hover:bg-cyan-600 text-white", label: "4 - Good" },
    5: { color: "bg-green-500 hover:bg-green-600 text-white", label: "5 - Excellent" },
  }[score];

  if (!config) return <Badge variant="outline">{score}</Badge>;

  return (
    <Badge className={`${config.color} border-transparent font-mono`}>
      {config.label}
    </Badge>
  );
}