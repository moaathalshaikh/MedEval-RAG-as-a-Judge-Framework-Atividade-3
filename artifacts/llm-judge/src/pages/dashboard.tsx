import { useGetAnalyticsSummary, useGetModelComparison, useListEvaluations } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScoreBadge } from "@/components/score-badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck2 } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: comparison, isLoading: isLoadingComparison } = useGetModelComparison();
  const { data: evaluations, isLoading: isLoadingEvaluations } = useListEvaluations();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">System overview and evaluation metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Models" value={summary?.totalModels} loading={isLoadingSummary} />
        <StatCard title="Datasets" value={summary?.totalDatasets} loading={isLoadingSummary} />
        <StatCard title="Questions" value={summary?.totalQuestions} loading={isLoadingSummary} />
        <StatCard title="Responses" value={summary?.totalResponses} loading={isLoadingSummary} />
        <StatCard title="Evaluations" value={summary?.totalEvaluations} loading={isLoadingSummary} />
        <StatCard title="Avg Score" value={summary?.averageScore?.toFixed(2)} loading={isLoadingSummary} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Model Comparison (Avg Score)</CardTitle>
            <CardDescription>Average evaluation score per model</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingComparison ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="full" height="100%">
                <BarChart data={comparison} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <XAxis dataKey="modelName" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} domain={[0, 5]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Average Score" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Start new evaluation pipelines</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/import" className="block">
              <Button className="w-full justify-start h-16 text-lg" variant="outline">
                <Upload className="mr-4 h-6 w-6" />
                Import Responses
              </Button>
            </Link>
            <Link href="/evaluate" className="block">
              <Button className="w-full justify-start h-16 text-lg" variant="outline">
                <FileCheck2 className="mr-4 h-6 w-6" />
                Run Judge
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingEvaluations ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evaluated At</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Judge</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluations?.slice(0, 5).map((evaluation) => (
                  <TableRow key={evaluation.id}>
                    <TableCell className="font-mono text-xs">{new Date(evaluation.evaluatedAt).toLocaleString()}</TableCell>
                    <TableCell>{evaluation.modelName}</TableCell>
                    <TableCell>{evaluation.judgeModelName}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={evaluation.questionText || ""}>
                      {evaluation.questionText}
                    </TableCell>
                    <TableCell><ScoreBadge score={evaluation.score} /></TableCell>
                  </TableRow>
                ))}
                {(!evaluations || evaluations.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No evaluations yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, loading }: { title: string; value?: string | number | null; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value ?? "-"}</div>
        )}
      </CardContent>
    </Card>
  );
}