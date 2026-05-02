import { useGetAnalyticsSummary, useGetModelComparison, useListEvaluations } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScoreBadge } from "@/components/score-badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck2, Activity, Database, Server, Crosshair } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: comparison, isLoading: isLoadingComparison } = useGetModelComparison();
  const { data: evaluations, isLoading: isLoadingEvaluations } = useListEvaluations();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase text-foreground">System Overview</h2>
          <p className="text-sm font-mono text-muted-foreground mt-1 tracking-wider uppercase">Live Benchmarking Telemetry</p>
        </div>
        <div className="flex gap-3">
          <Link href="/import">
            <Button variant="outline" className="rounded-none border-primary/50 text-primary hover:bg-primary/10 font-mono tracking-widest text-xs uppercase h-10">
              <Upload className="mr-2 h-4 w-4" /> Import Data
            </Button>
          </Link>
          <Link href="/evaluate">
            <Button className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-mono tracking-widest text-xs uppercase h-10">
              <FileCheck2 className="mr-2 h-4 w-4" /> Run Eval
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Models" value={summary?.totalModels} loading={isLoadingSummary} icon={Server} />
        <StatCard title="Datasets" value={summary?.totalDatasets} loading={isLoadingSummary} icon={Database} />
        <StatCard title="Questions" value={summary?.totalQuestions} loading={isLoadingSummary} icon={Crosshair} />
        <StatCard title="Responses" value={summary?.totalResponses} loading={isLoadingSummary} icon={Upload} />
        <StatCard title="Evaluations" value={summary?.totalEvaluations} loading={isLoadingSummary} icon={FileCheck2} />
        <StatCard title="Avg Score" value={summary?.averageScore?.toFixed(2)} loading={isLoadingSummary} icon={Activity} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 rounded-none border-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" /> Average Model Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] pt-6">
            {isLoadingComparison ? (
              <Skeleton className="w-full h-full rounded-none" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis 
                    dataKey="modelName" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fontFamily: 'var(--font-mono)' }}
                    dy={10}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    domain={[0, 5]}
                    tick={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 12, textTransform: 'uppercase' }}
                    itemStyle={{ color: "hsl(var(--primary))" }}
                  />
                  <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Score" barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 rounded-none border-border bg-card/50 backdrop-blur-sm flex flex-col">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <FileCheck2 className="h-4 w-4" /> Latest Evaluations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            {isLoadingEvaluations ? (
              <div className="p-6"><Skeleton className="h-[250px] w-full rounded-none" /></div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-10">Time</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-10">Subject</TableHead>
                    <TableHead className="text-[10px] font-mono tracking-widest uppercase h-10 text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluations?.slice(0, 6).map((evaluation) => (
                    <TableRow key={evaluation.id} className="border-border/50 hover:bg-muted/20">
                      <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(evaluation.evaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{evaluation.modelName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{evaluation.judgeModelName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <ScoreBadge score={evaluation.score} className="scale-90 origin-right" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!evaluations || evaluations.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs font-mono text-muted-foreground py-12 uppercase tracking-widest">
                        Awaiting Telemetry
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function StatCard({ title, value, loading, icon: Icon }: { title: string; value?: string | number | null; loading: boolean, icon: any }) {
  return (
    <Card className="rounded-none border-border bg-card/50 backdrop-blur-sm overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-border/30 px-4 py-3">
        <CardTitle className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{title}</CardTitle>
        <Icon className="h-3.5 w-3.5 text-primary/70" />
      </CardHeader>
      <CardContent className="px-4 py-4">
        {loading ? (
          <Skeleton className="h-8 w-20 rounded-none" />
        ) : (
          <div className="text-2xl font-light font-mono text-foreground tracking-tight">{value ?? "—"}</div>
        )}
      </CardContent>
    </Card>
  );
}