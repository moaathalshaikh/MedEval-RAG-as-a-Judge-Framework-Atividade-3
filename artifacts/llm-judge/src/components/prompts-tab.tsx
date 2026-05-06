import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Lock, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type PromptType = "MCQ_REFERENCE" | "OPEN_REFERENCE" | "EVALUATION";

export interface PromptItem {
  id: string;
  name: string;
  type: PromptType;
  isSystem: boolean;
  createdAt: string | null;
  ownerName: string;
  sections: Record<string, string | null>;
}

interface PromptDefaults {
  MCQ_PERSONA: string;
  OPEN_PERSONA: string;
  EVAL_PERSONA: string;
  RIGOR: string;
  GUIDANCE: string;
  EVAL_STEPS: string;
  JUDGE_RUBRIC: string;
}

const TYPE_LABELS: Record<PromptType, string> = {
  MCQ_REFERENCE: "MCQ Reference",
  OPEN_REFERENCE: "Open-ended Reference",
  EVALUATION: "Evaluation (Judge)",
};

const TYPE_COLORS: Record<PromptType, string> = {
  MCQ_REFERENCE: "bg-blue-100 text-blue-700",
  OPEN_REFERENCE: "bg-purple-100 text-purple-700",
  EVALUATION: "bg-amber-100 text-amber-700",
};

function usePrompts(type?: PromptType) {
  const params = type ? `?type=${type}` : "";
  return useQuery<PromptItem[]>({
    queryKey: ["prompts", type ?? "all"],
    queryFn: () => fetch(`/api/prompts${params}`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 10_000,
  });
}

function usePromptDefaults() {
  return useQuery<PromptDefaults>({
    queryKey: ["prompts", "defaults"],
    queryFn: () => fetch("/api/prompts/defaults", { credentials: "include" }).then((r) => r.json()),
    staleTime: Infinity,
  });
}

function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; type: PromptType; sections: Record<string, string | null> }) =>
      fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(async (r) => {
        if (!r.ok) throw await r.json();
        return r.json() as Promise<PromptItem>;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/prompts/${id}`, { method: "DELETE", credentials: "include" }).then(async (r) => {
        if (!r.ok) throw await r.json();
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

// ── Locked section display ────────────────────────────────────────────────────

function LockedSection({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30 text-muted-foreground">locked</Badge>
      </div>
      <Textarea
        readOnly
        value={value}
        rows={Math.min(value.split("\n").length + 1, 6)}
        className="text-xs font-mono bg-muted/40 text-muted-foreground resize-none border-dashed cursor-default"
      />
    </div>
  );
}

// ── Checkbox section ──────────────────────────────────────────────────────────

function CheckboxSection({
  label,
  hint,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  defaultValue: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const useDefault = value === null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox
            checked={useDefault}
            onCheckedChange={(checked) => onChange(checked ? null : defaultValue)}
            className="h-3.5 w-3.5"
          />
          <span className="text-xs text-muted-foreground">Use default</span>
        </label>
      </div>
      <Textarea
        placeholder={hint}
        readOnly={useDefault}
        value={useDefault ? defaultValue : (value ?? "")}
        rows={4}
        onChange={(e) => !useDefault && onChange(e.target.value)}
        className={`text-xs resize-none transition-colors ${useDefault ? "bg-muted/40 text-muted-foreground cursor-default" : ""}`}
      />
      {useDefault && (
        <p className="text-[10px] text-muted-foreground">Using system default — uncheck to customize</p>
      )}
    </div>
  );
}

// ── Create prompt form ────────────────────────────────────────────────────────

function CreatePromptForm({
  defaults,
  onCancel,
  onCreate,
  isPending,
}: {
  defaults: PromptDefaults;
  onCancel: () => void;
  onCreate: (body: { name: string; type: PromptType; sections: Record<string, string | null> }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PromptType>("MCQ_REFERENCE");

  // MCQ sections
  const [mcqPersona, setMcqPersona] = useState(defaults.MCQ_PERSONA);

  // Open sections
  const [openPersona, setOpenPersona] = useState(defaults.OPEN_PERSONA);
  const [openGuidance, setOpenGuidance] = useState<string | null>(null);

  // Eval sections
  const [evalPersona, setEvalPersona] = useState(defaults.EVAL_PERSONA);
  const [evalRigor, setEvalRigor] = useState<string | null>(null);
  const [evalRubric, setEvalRubric] = useState<string | null>(null);
  const [evalSteps, setEvalSteps] = useState<string | null>(null);

  const [showPreview, setShowPreview] = useState(false);

  function buildSections(): Record<string, string | null> {
    if (type === "MCQ_REFERENCE") return { persona: mcqPersona };
    if (type === "OPEN_REFERENCE") return { persona: openPersona, guidance: openGuidance };
    return { persona: evalPersona, rigor: evalRigor, rubric: evalRubric, evalSteps };
  }

  function buildPreview(): string {
    if (type === "MCQ_REFERENCE") {
      return `${mcqPersona} Answer the following multiple-choice question by stating the correct option letter only (A, B, C, or D).\n\nQuestion: {{question}}\nOptions: {{choices}}\n\nReply with only the correct option letter (e.g. "A" or "B"). No explanation needed.`;
    }
    if (type === "OPEN_REFERENCE") {
      return `${openPersona}\n\nQuestion: {{question}}\n\n${openGuidance ?? defaults.GUIDANCE}`;
    }
    return `[PERSONA]\n${evalPersona}\n\n${evalRigor ?? defaults.RIGOR}\n\n[RUBRIC]\n${evalRubric ?? defaults.JUDGE_RUBRIC}\n\n[CONTEXT]\nClinical Question: {{question}}\nLLM Reference Answer (Gold Standard): {{reference_answer}}\nSmall Model Response: {{model_response}}\n\n[INSTRUCTIONS]\n${evalSteps ?? defaults.EVAL_STEPS}\n\nRespond in exactly this JSON format (no other text):\n{"score": <integer 1-5>, "reasoning": "<detailed explanation>"}`;
  }

  function handleSubmit() {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), type, sections: buildSections() });
  }

  return (
    <Card className="border-primary/30 border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-primary">New Prompt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name + Type */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Prompt Name *</Label>
            <Input
              placeholder="e.g. Cardiology Expert v2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as PromptType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TYPE_LABELS) as [PromptType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Prompt sections — wrapped in a single bordered block */}
        <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Prompt Sections (assembled in order)</p>

          {type === "MCQ_REFERENCE" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Persona (free)</Label>
                <Textarea
                  value={mcqPersona}
                  onChange={(e) => setMcqPersona(e.target.value)}
                  rows={2}
                  placeholder="You are a medical expert."
                  className="text-xs resize-none"
                />
              </div>
              <LockedSection label="Question Injection" value={"Question: {{question}}\nOptions: {{choices}}"} />
              <LockedSection label="Output Format" value={'Reply with only the correct option letter (e.g. "A" or "B"). No explanation needed.'} />
            </>
          )}

          {type === "OPEN_REFERENCE" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Persona (free)</Label>
                <Textarea
                  value={openPersona}
                  onChange={(e) => setOpenPersona(e.target.value)}
                  rows={3}
                  placeholder={defaults.OPEN_PERSONA}
                  className="text-xs resize-none"
                />
              </div>
              <LockedSection label="Question Injection" value={"Question: {{question}}"} />
              <CheckboxSection
                label="Answer Guidance"
                hint="Describe what kind of answer you expect..."
                defaultValue={defaults.GUIDANCE}
                value={openGuidance}
                onChange={setOpenGuidance}
              />
            </>
          )}

          {type === "EVALUATION" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Persona (free)</Label>
                <Textarea
                  value={evalPersona}
                  onChange={(e) => setEvalPersona(e.target.value)}
                  rows={3}
                  placeholder={defaults.EVAL_PERSONA}
                  className="text-xs resize-none"
                />
              </div>
              <CheckboxSection
                label="Rigor Statement"
                hint="How strict should the evaluation be?"
                defaultValue={defaults.RIGOR}
                value={evalRigor}
                onChange={setEvalRigor}
              />
              <CheckboxSection
                label="Scoring Rubric (Score 1–5)"
                hint="Define score meanings..."
                defaultValue={defaults.JUDGE_RUBRIC}
                value={evalRubric}
                onChange={setEvalRubric}
              />
              <LockedSection
                label="Context Injection"
                value={"Clinical Question: {{question}}\nLLM Reference Answer (Gold Standard): {{reference_answer}}\nSmall Model Response: {{model_response}}"}
              />
              <CheckboxSection
                label="Evaluation Steps"
                hint="Step-by-step evaluation instructions..."
                defaultValue={defaults.EVAL_STEPS}
                value={evalSteps}
                onChange={setEvalSteps}
              />
              <LockedSection
                label="Output Format (always enforced)"
                value={'Respond in exactly this JSON format (no other text):\n{"score": <integer 1-5>, "reasoning": "<detailed Chain-of-Thought explanation>"}'}
              />
            </>
          )}
        </div>

        {/* Preview */}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          {showPreview ? "Hide" : "Preview"} assembled prompt
          {showPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <AnimatePresence>
          {showPreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Textarea
                readOnly
                value={buildPreview()}
                rows={12}
                className="text-xs font-mono bg-slate-50 border-slate-200 resize-none"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isPending}
            size="sm"
            className="gap-1.5 bg-primary hover:bg-primary/90"
          >
            {isPending ? (
              <div className="h-3.5 w-3.5 border-2 border-white border-r-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Save Prompt
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Prompt card ───────────────────────────────────────────────────────────────

function PromptCard({ prompt, onDelete, isDeleting }: { prompt: PromptItem; onDelete: () => void; isDeleting: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${prompt.isSystem ? "bg-muted/30 border-dashed" : "bg-background"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{prompt.name}</span>
            <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 ${TYPE_COLORS[prompt.type]}`}>
              {TYPE_LABELS[prompt.type]}
            </Badge>
            {prompt.isSystem && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                System
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {prompt.isSystem ? "Built-in default" : `Created by ${prompt.ownerName}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {!prompt.isSystem && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 border-t border-border/50 space-y-2">
              {Object.entries(prompt.sections).map(([key, val]) => (
                <div key={key}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">{key}</p>
                  <p className="text-xs text-foreground bg-muted/40 rounded px-2 py-1.5 whitespace-pre-wrap font-mono">
                    {val === null ? <span className="text-muted-foreground italic">default</span> : val}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main PromptsTab component ─────────────────────────────────────────────────

export default function PromptsTab() {
  const { data: prompts, isLoading } = usePrompts();
  const { data: defaults } = usePromptDefaults();
  const createPrompt = useCreatePrompt();
  const deletePrompt = useDeletePrompt();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleCreate(body: { name: string; type: PromptType; sections: Record<string, string | null> }) {
    createPrompt.mutate(body, {
      onSuccess: () => {
        setShowCreate(false);
        toast({ title: "Prompt saved", description: `"${body.name}" is now available in Reference Answers.` });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: (err as { error?: string }).error ?? "Unknown error", variant: "destructive" });
      },
    });
  }

  function handleDelete(id: string, name: string) {
    setDeletingId(id);
    deletePrompt.mutate(id, {
      onSuccess: () => {
        setDeletingId(null);
        toast({ title: "Prompt deleted", description: `"${name}" has been removed.` });
      },
      onError: (err) => {
        setDeletingId(null);
        toast({ title: "Failed to delete", description: (err as { error?: string }).error ?? "Unknown error", variant: "destructive" });
      },
    });
  }

  const groupedPrompts = (prompts ?? []).reduce<Record<PromptType, PromptItem[]>>(
    (acc, p) => { acc[p.type].push(p); return acc; },
    { MCQ_REFERENCE: [], OPEN_REFERENCE: [], EVALUATION: [] }
  );

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Custom Prompts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create custom prompt variants to experiment with different wordings. Select them in Reference Answers and Evaluate.
          </p>
        </div>
        {!showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5" />
            New Prompt
          </Button>
        )}
      </div>

      <AnimatePresence>
        {showCreate && defaults && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <CreatePromptForm
              defaults={defaults}
              onCancel={() => setShowCreate(false)}
              onCreate={handleCreate}
              isPending={createPrompt.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {(["MCQ_REFERENCE", "OPEN_REFERENCE", "EVALUATION"] as PromptType[]).map((type) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>
                  {TYPE_LABELS[type]}
                </span>
                <span className="text-xs text-muted-foreground">{groupedPrompts[type].length} prompts</span>
              </div>
              <div className="space-y-2">
                {groupedPrompts[type].map((p) => (
                  <PromptCard
                    key={p.id}
                    prompt={p}
                    onDelete={() => handleDelete(p.id, p.name)}
                    isDeleting={deletingId === p.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">How it works</p>
        <p>• <strong>System Default</strong> prompts use the built-in clinical cardiologist persona — safe and tested.</p>
        <p>• Custom prompts must include the same <strong>type</strong> as the step where you want to use them.</p>
        <p>• <strong>Locked sections</strong> (variable injections and JSON format) are always added automatically — you cannot remove them.</p>
        <p>• Prompts are <strong>per-user</strong> — other users cannot see or delete yours.</p>
      </div>
    </div>
  );
}
