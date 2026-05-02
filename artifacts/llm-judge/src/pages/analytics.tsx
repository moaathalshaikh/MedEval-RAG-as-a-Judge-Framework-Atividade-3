import { useGetModelComparison, useGetScoreDistribution, useGetSpearmanCorrelation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from "recharts";
import { motion } from "framer-motion";

export default function Analytics() {
  const { data: comparison, isLoading: isLoadingComparison } = useGetModelComparison();
  const { data: distribution, isLoading: isLoadingDist } = useGetScoreDistribution();
  const { data: spearman, isLoading: isLoadingSpearman } = useGetSpearmanCorrelation();

  const distChartData = (() => {
    if (!distribution) return [];
    const modelMap = new Map<string, any>();
    distribution.forEach(row => {
      if (!modelMap.has(row.modelName)) {
        modelMap.set(row.modelName, { modelName: row.modelName, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
      }
      const item = modelMap.get(row.modelName);
      item[row.score.toString()] = row.count;
    });
    return Array.from(modelMap.values());
  })();

  const SCORE_COLORS = {
    "1": "#ef4444",
    "2": "#f97316",
    "3": "#eab308",
    "4": "#3b82f6",
    "5": "#22c55e",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Statistical insights and model comparison</p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Spearman Correlation</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSpearman ? (
              <Skeleton className="h-16 w-full" />
            ) : spearman && spearman.correlation !== null ? (
              <div>
                <p className="text-4xl font-bold text-primary">{spearman.correlation?.toFixed(3)}</p>
                <p className="text-xs text-muted-foreground mt-1">ρ · {spearman.interpretation}</p>
                <p className="text-xs text-muted-foreground mt-0.5">n={spearman.sampleSize} · p={spearman.pValue?.toFixed(4)}</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">Insufficient data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">MCQ Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSpearman ? (
              <Skeleton className="h-16 w-full" />
            ) : spearman && spearman.mcqAccuracy !== null ? (
              <div>
                <p className="text-4xl font-bold text-foreground">{(spearman.mcqAccuracy * 100).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">Exact match rate on MCQ questions</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">No MCQ records</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Inference Latency</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-1">
            {isLoadingComparison ? (
              <div className="px-6 py-2"><Skeleton className="h-16 w-full" /></div>
            ) : comparison && comparison.length > 0 ? (
              <div>
                {comparison.map(m => (
                  <div key={m.modelId} className="flex justify-between items-center py-2 px-6 border-b border-border last:border-0">
                    <span className="text-sm font-medium truncate mr-2">{m.modelName}</span>
                    <span className="text-sm font-mono text-primary shrink-0">
                      {m.avgInferenceMs ? `${Math.round(m.avgInferenceMs)}ms` : "N/A"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-4 text-sm text-muted-foreground">No latency data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Average Score by Model</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px] pt-2">
            {isLoadingComparison ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 5]} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="modelName" type="category" stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} width={120} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: "hsl(var(--primary))" }}
                  />
                  <ReferenceLine x={3} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.6} />
                  <Bar dataKey="avgScore" name="Avg Score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px] pt-2">
            {isLoadingDist ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="modelName" stroke="hsl(var(--foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} iconType="circle" />
                  <Bar dataKey="1" stackId="a" fill={SCORE_COLORS["1"]} name="Score 1" />
                  <Bar dataKey="2" stackId="a" fill={SCORE_COLORS["2"]} name="Score 2" />
                  <Bar dataKey="3" stackId="a" fill={SCORE_COLORS["3"]} name="Score 3" />
                  <Bar dataKey="4" stackId="a" fill={SCORE_COLORS["4"]} name="Score 4" />
                  <Bar dataKey="5" stackId="a" fill={SCORE_COLORS["5"]} name="Score 5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
