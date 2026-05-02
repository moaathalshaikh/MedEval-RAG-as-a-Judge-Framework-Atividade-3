import { useGetModelComparison, useGetScoreDistribution, useGetSpearmanCorrelation } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from "recharts";
import { Activity, Target, Network, BarChart2 } from "lucide-react";
import { motion } from "framer-motion";

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
    "1": "hsl(var(--destructive))",
    "2": "hsl(27, 87%, 60%)",
    "3": "hsl(43, 74%, 60%)",
    "4": "hsl(173, 58%, 39%)",
    "5": "hsl(var(--primary))",
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="border-b border-border pb-6">
        <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-primary" />
          Analytics & Insights
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-2 tracking-wider uppercase">Statistical Validation & Metrics</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 rounded-none bg-primary/5 border border-primary/20 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute -right-10 -top-10 text-primary/10">
            <Network className="h-40 w-40" />
          </div>
          <CardHeader className="border-b border-primary/10 pb-4 relative z-10">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-primary flex items-center gap-2">
              <Network className="h-4 w-4" />
              Judge Correlation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 relative z-10">
            {isLoadingSpearman ? (
              <Skeleton className="h-24 w-full bg-primary/10 rounded-none" />
            ) : spearman && spearman.correlation !== null ? (
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-light font-mono tracking-tighter text-primary">
                    {spearman.correlation?.toFixed(3)}
                  </span>
                  <span className="text-xs font-mono text-primary/70 mb-2 uppercase tracking-widest">Spearman ρ</span>
                </div>
                <div className="space-y-2 border-t border-primary/10 pt-4">
                  <div className="text-sm font-sans font-medium text-foreground">{spearman.interpretation}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex gap-4">
                    <span>N = {spearman.sampleSize}</span>
                    <span>P = {spearman.pValue?.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground h-24 flex items-center justify-center">
                Insufficient Variance
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1 rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Categorical Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
             {isLoadingSpearman ? (
              <Skeleton className="h-24 w-full rounded-none" />
            ) : spearman && spearman.mcqAccuracy !== null ? (
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-light font-mono tracking-tighter text-foreground">
                    {(spearman.mcqAccuracy * 100).toFixed(1)}%
                  </span>
                  <span className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-widest">MCQ Rate</span>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    Exact Match Verification
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground h-24 flex items-center justify-center">
                No MCQ Records
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1 rounded-none border-border bg-card/50 backdrop-blur-sm flex flex-col">
          <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Latency Profiling
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 overflow-auto px-0">
             {isLoadingComparison ? (
              <div className="px-6"><Skeleton className="h-24 w-full rounded-none" /></div>
            ) : comparison && comparison.length > 0 ? (
               <div className="space-y-0">
                 {comparison.map(m => (
                   <div key={m.modelId} className="flex justify-between items-center py-2 px-6 border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                     <span className="font-sans text-sm font-medium text-foreground truncate mr-2">{m.modelName}</span>
                     <span className="font-mono text-xs text-primary bg-primary/5 px-2 py-0.5 shrink-0">
                       {m.avgInferenceMs ? `${Math.round(m.avgInferenceMs)}ms` : 'N/A'}
                     </span>
                   </div>
                 ))}
               </div>
            ) : (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground h-24 flex items-center justify-center">
                No Latency Metrics
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Mean Performance Vector</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px] pt-8">
            {isLoadingComparison ? (
              <Skeleton className="w-full h-full rounded-none" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="2 2" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis type="number" domain={[0, 5]} stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tick={{fontFamily: 'var(--font-mono)'}} />
                  <YAxis dataKey="modelName" type="category" stroke="hsl(var(--foreground))" fontSize={11} tickLine={false} axisLine={false} width={120} tick={{fontFamily: 'var(--font-sans)', fontWeight: 500}} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))', opacity: 0.1}}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase' }}
                    itemStyle={{ color: "hsl(var(--primary))" }}
                  />
                  <ReferenceLine x={3} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
                  <Bar dataKey="avgScore" name="AVG SCORE" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Score Frequency Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px] pt-8">
             {isLoadingDist ? (
              <Skeleton className="w-full h-full rounded-none" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distChartData} margin={{ top: 0, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="modelName" stroke="hsl(var(--foreground))" fontSize={10} tickLine={false} axisLine={false} tick={{fontFamily: 'var(--font-sans)'}} dy={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tick={{fontFamily: 'var(--font-mono)'}} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))', opacity: 0.1}}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase' }}
                  />
                  <Legend 
                    wrapperStyle={{fontFamily: 'var(--font-mono)', fontSize: 10, paddingTop: 20}}
                    iconType="square"
                  />
                  <Bar dataKey="1" stackId="a" fill={COLORS["1"]} name="SCORE 1" />
                  <Bar dataKey="2" stackId="a" fill={COLORS["2"]} name="SCORE 2" />
                  <Bar dataKey="3" stackId="a" fill={COLORS["3"]} name="SCORE 3" />
                  <Bar dataKey="4" stackId="a" fill={COLORS["4"]} name="SCORE 4" />
                  <Bar dataKey="5" stackId="a" fill={COLORS["5"]} name="SCORE 5" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}