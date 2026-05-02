import { useGetModelComparison, useGetScoreDistribution, useGetSpearmanCorrelation } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Activity, Sigma, Target } from "lucide-react";

export default function Analytics() {
  const { data: comparison, isLoading: isLoadingComparison } = useGetModelComparison();
  const { data: distribution, isLoading: isLoadingDist } = useGetScoreDistribution();
  const { data: spearman, isLoading: isLoadingSpearman } = useGetSpearmanCorrelation();

  // Transform distribution data for stacked bar chart
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

  const COLORS = {
    "1": "hsl(0, 62.8%, 30.6%)", // Destructive
    "2": "hsl(27, 87%, 67%)", // Chart-5
    "3": "hsl(43, 74%, 66%)", // Chart-4
    "4": "hsl(173, 58%, 39%)", // Chart-2
    "5": "hsl(142, 71%, 45%)", // Green
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
        <p className="text-muted-foreground">Deep dive into model performance and evaluation quality.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sigma className="h-5 w-5 text-primary" />
              Spearman Correlation
            </CardTitle>
            <CardDescription>Are the judge's scores reliable?</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSpearman ? (
              <Skeleton className="h-32 w-full" />
            ) : spearman && spearman.correlation !== null ? (
              <div className="space-y-4">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-bold font-mono tracking-tighter text-primary">
                    {spearman.correlation?.toFixed(3)}
                  </span>
                  <span className="text-sm text-muted-foreground mb-1 pb-1">r</span>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">{spearman.interpretation}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    n={spearman.sampleSize} | p={spearman.pValue?.toFixed(4)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground h-32 flex items-center justify-center">
                Not enough varied data to calculate correlation.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              MCQ Accuracy
            </CardTitle>
            <CardDescription>Exact match rate on multiple choice</CardDescription>
          </CardHeader>
          <CardContent>
             {isLoadingSpearman ? (
              <Skeleton className="h-32 w-full" />
            ) : spearman && spearman.mcqAccuracy !== null ? (
              <div className="space-y-4 flex flex-col justify-center h-full pt-4">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-bold font-mono tracking-tighter">
                    {(spearman.mcqAccuracy * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground h-32 flex items-center justify-center">
                No MCQ data available.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Inference Speed
            </CardTitle>
            <CardDescription>Average latency per generation</CardDescription>
          </CardHeader>
          <CardContent>
             {isLoadingComparison ? (
              <Skeleton className="h-32 w-full" />
            ) : comparison && comparison.length > 0 ? (
               <div className="space-y-2 mt-2 max-h-32 overflow-y-auto">
                 {comparison.map(m => (
                   <div key={m.modelId} className="flex justify-between text-sm items-center border-b border-border/50 pb-1 last:border-0">
                     <span className="truncate mr-2">{m.modelName}</span>
                     <span className="font-mono text-muted-foreground shrink-0">
                       {m.avgInferenceMs ? `${Math.round(m.avgInferenceMs)}ms` : '-'}
                     </span>
                   </div>
                 ))}
               </div>
            ) : (
              <div className="text-sm text-muted-foreground h-32 flex items-center justify-center">
                No timing data available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Average Score Comparison</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            {isLoadingComparison ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 5]} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="modelName" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="avgScore" name="Avg Score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
             {isLoadingDist ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="modelName" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend iconType="circle" />
                  <Bar dataKey="1" stackId="a" fill={COLORS["1"]} name="Score 1" />
                  <Bar dataKey="2" stackId="a" fill={COLORS["2"]} name="Score 2" />
                  <Bar dataKey="3" stackId="a" fill={COLORS["3"]} name="Score 3" />
                  <Bar dataKey="4" stackId="a" fill={COLORS["4"]} name="Score 4" />
                  <Bar dataKey="5" stackId="a" fill={COLORS["5"]} name="Score 5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}