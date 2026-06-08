import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListDatasets, useListModels } from "@workspace/api-client-react";
import {
  BookOpen, Plus, Trash2, Zap, Search, Play, Loader2,
  FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Database,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RagDoc {
  id: number;
  title: string;
  domain: string | null;
  sourceYear: number | null;
  sourceRef: string | null;
  chunkCount: number;
  embeddedAt: string | null;
  createdAt: string;
}

interface RagStats {
  documents: number;
  chunks: number;
  ragResponses: number;
}

interface SearchChunk {
  chunk_text: string;
  similarity: number;
  document_id: number;
  doc_title: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RagKnowledgeBase() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [stats, setStats] = useState<RagStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  async function refresh() {
    try {
      const [docsData, statsData] = await Promise.all([
        apiFetch("/rag/documents"),
        apiFetch("/rag/stats"),
      ]);
      setDocs(docsData);
      setStats(statsData);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          RAG Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Curate clinical documents, generate embeddings, and run RAG-augmented re-inference (Activity 3).
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Documents", value: stats.documents, icon: FileText },
            { label: "Embedded Chunks", value: stats.chunks, icon: Database },
            { label: "RAG Responses", value: stats.ragResponses, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="py-3">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add document */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowAddForm(!showAddForm)}>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Add Clinical Document
            </span>
            {showAddForm ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        {showAddForm && (
          <CardContent>
            <AddDocumentForm onAdded={() => { setShowAddForm(false); refresh(); }} />
          </CardContent>
        )}
      </Card>

      {/* Documents list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Knowledge Base ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No documents yet. Add your first clinical document above.
            </p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <DocRow key={doc.id} doc={doc} onUpdate={refresh} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test search */}
      <SearchCard docs={docs} />

      {/* RAG Re-inference */}
      <ReInferCard docs={docs} onDone={refresh} />
    </motion.div>
  );
}

// ── Add Document Form ─────────────────────────────────────────────────────────

function AddDocumentForm({ onAdded }: { onAdded: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [domain, setDomain] = useState("");
  const [sourceYear, setSourceYear] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/rag/documents", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          domain: domain.trim() || undefined,
          sourceYear: sourceYear ? parseInt(sourceYear) : undefined,
          sourceRef: sourceRef.trim() || undefined,
        }),
      });
      toast({ title: "Document added", description: "Ready to embed." });
      onAdded();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Title *</Label>
          <Input
            placeholder="e.g. ADA Standards of Care 2024 — Diabetes Pharmacotherapy"
            value={title} onChange={(e) => setTitle(e.target.value)} required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Domain</Label>
          <Input placeholder="e.g. Endocrinology" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Source Year</Label>
          <Input type="number" placeholder="2024" value={sourceYear} onChange={(e) => setSourceYear(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Source Reference</Label>
          <Input placeholder="e.g. ADA Diabetes Care, Vol 47, Supplement 1, 2024" value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Content * <span className="text-muted-foreground font-normal">(plain text — paste directly from guideline)</span></Label>
          <Textarea
            placeholder="Paste the full text of the clinical guideline, consensus statement, or reference document here..."
            value={content} onChange={(e) => setContent(e.target.value)}
            className="min-h-[200px] font-mono text-xs leading-relaxed"
            required
          />
          <p className="text-[10px] text-muted-foreground">
            {content.length.toLocaleString()} characters · approx. {Math.ceil(content.length / 800)} chunks
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2.5 text-xs text-amber-800">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p>Choose documents that cover knowledge <strong>after the model's training cutoff</strong>. Include the source year to demonstrate temporality in your report.</p>
      </div>

      <Button type="submit" disabled={saving || !title.trim() || !content.trim()} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add Document
      </Button>
    </form>
  );
}

// ── Document Row ──────────────────────────────────────────────────────────────

function DocRow({ doc, onUpdate }: { doc: RagDoc; onUpdate: () => void }) {
  const { toast } = useToast();
  const [embedding, setEmbedding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleEmbed() {
    setEmbedding(true);
    try {
      const result = await apiFetch(`/rag/documents/${doc.id}/embed`, { method: "POST", body: "{}" });
      toast({
        title: "Embedded",
        description: `${result.embedded} chunks generated${result.errors?.length ? ` (${result.errors.length} errors)` : ""}`,
      });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Embedding failed", description: e.message, variant: "destructive" });
    } finally {
      setEmbedding(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${doc.title}" and all its chunks?`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/rag/documents/${doc.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const isEmbedded = doc.chunkCount > 0 && !!doc.embeddedAt;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
      <div className="mt-0.5">
        {isEmbedded
          ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {doc.domain && <Badge variant="secondary" className="text-[10px]">{doc.domain}</Badge>}
          {doc.sourceYear && <Badge variant="outline" className="text-[10px]">{doc.sourceYear}</Badge>}
          {isEmbedded
            ? <span className="text-[10px] text-green-600 font-medium">{doc.chunkCount} chunks embedded</span>
            : <span className="text-[10px] text-amber-600">Not embedded yet</span>
          }
          {doc.sourceRef && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{doc.sourceRef}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
          onClick={handleEmbed} disabled={embedding}
        >
          {embedding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {isEmbedded ? "Re-embed" : "Embed"}
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={handleDelete} disabled={deleting}
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

// ── Search Test Card ──────────────────────────────────────────────────────────

function SearchCard({ docs }: { docs: RagDoc[] }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchChunk[]>([]);
  const [searching, setSearching] = useState(false);

  const embeddedDocs = docs.filter((d) => d.chunkCount > 0);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || embeddedDocs.length === 0) return;
    setSearching(true);
    try {
      const data = await apiFetch("/rag/search", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), topK: 3 }),
      });
      setResults(data.chunks ?? []);
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Test Retrieval
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter a clinical question to see which chunks the RAG system would retrieve.
        </p>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="e.g. What is the first-line treatment for type 2 diabetes?"
            value={query} onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={searching || embeddedDocs.length === 0} className="gap-1.5 shrink-0">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </form>
        {embeddedDocs.length === 0 && (
          <p className="text-xs text-amber-600">Embed at least one document to test retrieval.</p>
        )}
        {results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top {results.length} retrieved chunks</p>
            {results.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">{r.doc_title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    similarity {(Number(r.similarity) * 100).toFixed(1)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.chunk_text}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── RAG Re-Inference Card ─────────────────────────────────────────────────────

function ReInferCard({ docs, onDone }: { docs: RagDoc[]; onDone: () => void }) {
  const { toast } = useToast();
  const { data: datasets } = useListDatasets();
  const { data: models } = useListModels();
  const [datasetId, setDatasetId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ generated: number; skipped: number; errors: string[] } | null>(null);

  const embeddedDocs = docs.filter((d) => d.chunkCount > 0);

  function toggleDoc(id: number) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleRun() {
    if (!datasetId || !modelId) return;
    setRunning(true);
    setResult(null);
    try {
      const data = await apiFetch("/rag/re-infer", {
        method: "POST",
        body: JSON.stringify({
          datasetId: parseInt(datasetId),
          modelId: parseInt(modelId),
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          topK: 3,
        }),
      });
      setResult(data);
      toast({
        title: "RAG Re-inference complete",
        description: `${data.generated} responses generated`,
      });
      onDone();
    } catch (e: any) {
      toast({ title: "Re-inference failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          RAG Re-Inference
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Re-run a model on an entire dataset with RAG context injected into each prompt.
          Results are stored alongside original responses for direct comparison in Analytics.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Dataset</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select dataset…" />
              </SelectTrigger>
              <SelectContent>
                {(datasets as any[])?.map((d: any) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.datasetName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select model…" />
              </SelectTrigger>
              <SelectContent>
                {(models as any[])?.map((m: any) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.modelName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Documents to use <span className="text-muted-foreground font-normal">(none = all embedded)</span></Label>
          {embeddedDocs.length === 0 ? (
            <p className="text-xs text-amber-600">No embedded documents available. Embed documents above first.</p>
          ) : (
            <div className="space-y-1.5">
              {embeddedDocs.map((d) => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(d.id)}
                    onChange={() => toggleDoc(d.id)}
                    className="accent-primary"
                  />
                  <span>{d.title}</span>
                  <Badge variant="secondary" className="text-[10px]">{d.chunkCount} chunks</Badge>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex gap-2.5 text-xs text-blue-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
          <p>This will generate new responses with <code className="font-mono">rag_enabled = true</code>. Original responses are preserved. You can then run the Judge on RAG responses and compare Spearman ρ in Analytics.</p>
        </div>

        {result && (
          <div className={`rounded-lg p-3 text-sm space-y-1 ${result.errors.length > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
            <p className="font-medium">
              ✓ {result.generated} generated · {result.skipped} skipped
            </p>
            {result.errors.slice(0, 3).map((e, i) => (
              <p key={i} className="text-xs text-muted-foreground">{e}</p>
            ))}
          </div>
        )}

        <Button
          onClick={handleRun}
          disabled={running || !datasetId || !modelId || embeddedDocs.length === 0}
          className="w-full gap-2"
        >
          {running ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Running RAG re-inference…</>
          ) : (
            <><Play className="h-4 w-4" />Run RAG Re-Inference</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
