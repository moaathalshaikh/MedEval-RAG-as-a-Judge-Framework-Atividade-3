import { useGetAnalyticsSummary, useGetModelComparison, useListEvaluations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScoreBadge } from "@/components/score-badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck2, Activity, Database, Server, Brain } from "lucide-react";
import { motion } from "framer-motion";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: comparison, isLoading: isLoadingComparison } = useGetModelComparison();
  const { data: evaluations, isLoading: isLoadingEvaluations } = useListEvaluations();

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live benchmarking overview</p>
        </div>
        <div className="flex gap-2">
          <Link href="/import">
            <Button variant="outline" size="sm" className="gap-2">
              <Upload className="h-4 w-4" /> Import Responses
            </Button>
          </Link>
          <Link href="/evaluate">
            <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90">
              <FileCheck2 className="h-4 w-4" /> Run Evaluation
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={item} className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Models" value={summary?.totalModels} loading={isLoadingSummary} icon={Server} color="blue" />
        <StatCard title="Datasets" value={summary?.totalDatasets} loading={isLoadingSummary} icon={Database} color="green" />
        <StatCard title="Questions" value={summary?.totalQuestions} loading={isLoadingSummary} icon={Brain} color="purple" />
        <StatCard title="Responses" value={summary?.totalResponses} loading={isLoadingSummary} icon={Upload} color="amber" />
        <StatCard title="Evaluations" value={summary?.totalEvaluations} loading={isLoadingSummary} icon={FileCheck2} color="rose" />
        <StatCard title="Avg Score" value={summary?.averageScore?.toFixed(2)} loading={isLoadingSummary} icon={Activity} color="teal" />
      </motion.div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-7">
        <motion.div variants={item} className="md:col-span-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Model Performance</CardTitle>
              <p className="text-xs text-muted-foreground">Average judge scores per model</p>
            </CardHeader>
            <CardContent className="h-[300px] pt-2">
              {isLoadingComparison ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison} margin={{ top: 5, right: 20, bottom: 25, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="modelName" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} domain={[0, 5]} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: "hsl(var(--primary))" }}
                    />
                    <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Avg Score" barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item} className="md:col-span-3">
          <Card className="flex flex-col h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Recent Evaluations</CardTitle>
              <p className="text-xs text-muted-foreground">Latest judge results</p>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              {isLoadingEvaluations ? (
                <div className="p-4"><Skeleton className="h-[200px] w-full" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="text-xs h-9 pl-4">Time</TableHead>
                      <TableHead className="text-xs h-9">Model</TableHead>
                      <TableHead className="text-xs h-9 text-right pr-4">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluations?.slice(0, 6).map((ev) => (
                      <TableRow key={ev.id} className="border-border hover:bg-muted/40">
                        <TableCell className="text-xs text-muted-foreground pl-4 whitespace-nowrap">
                          {new Date(ev.evaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium">{ev.modelName}</span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <ScoreBadge score={ev.score} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!evaluations || evaluations.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-12">
                          No evaluations yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

const colorMap = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600",   icon: "text-blue-500" },
  green:  { bg: "bg-green-50",  text: "text-green-700",  icon: "text-green-500" },
  purple: { bg: "bg-purple-50", text: "text-purple-600", icon: "text-purple-500" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  icon: "text-amber-500" },
  rose:   { bg: "bg-rose-50",   text: "text-rose-600",   icon: "text-rose-500" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-700",   icon: "text-teal-500" },
};

function StatCard({ title, value, loading, icon: Icon, color }: {
  title: string; value?: string | number | null; loading: boolean; icon: any; color: keyof typeof colorMap;
}) {
  const c = colorMap[color];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-14 mb-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground leading-tight">{value ?? "—"}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{title}</p>
      </CardContent>
    </Card>
  );
}
