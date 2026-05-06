const tables = [
  {
    group: "auth",
    color: "#475569",
    icon: "👤",
    name: "users",
    cols: [
      { badge: "PK", name: "id", type: "varchar" },
      { badge: "UQ", name: "email", type: "varchar" },
      { name: "first_name", type: "varchar" },
      { name: "last_name", type: "varchar" },
      { name: "profile_image_url", type: "varchar" },
      { name: "created_at / updated_at", type: "timestamptz" },
    ],
  },
  {
    group: "auth",
    color: "#475569",
    icon: "🔐",
    name: "sessions",
    cols: [
      { badge: "PK", name: "sid", type: "varchar" },
      { name: "sess", type: "jsonb" },
      { name: "expire", type: "timestamp" },
    ],
  },
  {
    group: "meta",
    color: "#ea580c",
    icon: "⚙️",
    name: "settings",
    cols: [
      { badge: "PK", name: "id", type: "serial" },
      { badge: "FK", name: "user_id", type: "→ users CASCADE" },
      { badge: "UQ", name: "(user_id, key)", type: "" },
      { name: "key / value", type: "text" },
      { name: "updated_at", type: "timestamptz" },
    ],
  },
  {
    group: "core",
    color: "#16a34a",
    icon: "🤖",
    name: "models",
    cols: [
      { badge: "PK", name: "id_model", type: "serial" },
      { name: "model_name", type: "text" },
      { name: "model_size / model_type", type: "text" },
      { name: "notes", type: "text" },
      { badge: "FK", name: "created_by", type: "→ users SET NULL" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    group: "core",
    color: "#16a34a",
    icon: "📦",
    name: "datasets",
    cols: [
      { badge: "PK", name: "id_dataset", type: "serial" },
      { name: "dataset_name / domain", type: "text" },
      { name: "dataset_type", type: "text" },
      { badge: "FK", name: "created_by", type: "→ users SET NULL" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    group: "judge",
    color: "#7c3aed",
    icon: "⚖️",
    name: "judge_models",
    cols: [
      { badge: "PK", name: "id_judge_model", type: "serial" },
      { name: "provider", type: "text" },
      { name: "display_name", type: "text" },
      { name: "model_version", type: "text" },
    ],
  },
  {
    group: "core",
    color: "#16a34a",
    icon: "❓",
    name: "questions",
    cols: [
      { badge: "PK", name: "id_question", type: "serial" },
      { badge: "FK", name: "id_dataset", type: "→ datasets CASCADE 🗑️" },
      { name: "question_text / gold_answer", type: "text" },
      { name: "question_type", type: "MCQ | OPEN_ENDED" },
      { name: "metadata", type: "jsonb (must_have, choices…)" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    group: "resp",
    color: "#0891b2",
    icon: "💬",
    name: "model_responses",
    cols: [
      { badge: "PK", name: "id_response", type: "serial" },
      { badge: "FK", name: "id_question", type: "→ questions CASCADE 🗑️" },
      { badge: "FK", name: "id_model", type: "→ models CASCADE 🗑️" },
      { badge: "UQ", name: "(id_question, id_model)", type: "" },
      { name: "response_text", type: "text" },
      { name: "inference_time_ms", type: "int" },
      { name: "must_have_score", type: "real  (open-ended)" },
      { name: "mcq_correct / mcq_score", type: "text  (MCQ)" },
      { badge: "FK", name: "created_by", type: "→ users SET NULL" },
    ],
  },
  {
    group: "judge",
    color: "#7c3aed",
    icon: "📋",
    name: "reference_answers",
    cols: [
      { badge: "PK", name: "id", type: "serial" },
      { badge: "FK", name: "question_id", type: "→ questions CASCADE 🗑️" },
      { badge: "FK", name: "judge_model_id", type: "→ judge_models CASCADE 🗑️" },
      { badge: "UQ", name: "(question_id, judge_model_id)", type: "" },
      { name: "answer_text", type: "text" },
      { name: "model_version / confirmed_model", type: "text" },
      { badge: "FK", name: "created_by", type: "→ users SET NULL" },
      { name: "generated_at", type: "timestamptz" },
    ],
  },
  {
    group: "judge",
    color: "#7c3aed",
    icon: "🏆",
    name: "judge_evaluations",
    cols: [
      { badge: "PK", name: "id_evaluation", type: "serial" },
      { badge: "FK", name: "id_response", type: "→ model_responses CASCADE 🗑️" },
      { badge: "FK", name: "judge_model_id", type: "→ judge_models CASCADE 🗑️" },
      { name: "score", type: "int  (1–5)" },
      { name: "reasoning", type: "text  (Chain-of-Thought)" },
      { name: "judge_model_version / confirmed_model", type: "text" },
      { badge: "FK", name: "created_by", type: "→ users SET NULL" },
      { name: "evaluated_at", type: "timestamptz" },
    ],
  },
  {
    group: "meta",
    color: "#ea580c",
    icon: "📜",
    name: "activity_log",
    cols: [
      { badge: "PK", name: "id", type: "serial" },
      { name: "action / entity_type / entity_name", type: "text" },
      { name: "user_id / user_email / user_name", type: "text" },
      { name: "details", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
];

const badgeStyle: Record<string, React.CSSProperties> = {
  PK: { background: "#fef3c7", color: "#92400e" },
  FK: { background: "#dbeafe", color: "#1e40af" },
  UQ: { background: "#f3e8ff", color: "#6d28d9" },
};

function TableCard({ table }: { table: (typeof tables)[0] }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.09)", minWidth: 230, flex: "1 1 220px", maxWidth: 300 }}>
      <div style={{ background: table.color, color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 13, letterSpacing: ".4px", display: "flex", alignItems: "center", gap: 7 }}>
        <span>{table.icon}</span>
        <span style={{ textTransform: "uppercase" }}>{table.name}</span>
      </div>
      <div>
        {table.cols.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
            {c.badge ? (
              <span style={{ ...badgeStyle[c.badge], fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 700, whiteSpace: "nowrap" }}>{c.badge}</span>
            ) : (
              <span style={{ width: 28, flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, fontWeight: 500, color: "#111827" }}>{c.name}</span>
            <span style={{ color: "#9ca3af", fontSize: 11, fontFamily: "monospace", textAlign: "right" }}>{c.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const rows: (typeof tables)[] = [
  tables.filter(t => t.name === "users" || t.name === "sessions" || t.name === "settings"),
  tables.filter(t => t.name === "models" || t.name === "datasets" || t.name === "judge_models"),
  tables.filter(t => t.name === "questions"),
  tables.filter(t => t.name === "model_responses" || t.name === "reference_answers"),
  tables.filter(t => t.name === "judge_evaluations" || t.name === "activity_log"),
];

const fks = [
  { from: "settings.user_id", to: "users.id", rule: "CASCADE", color: "#ef4444" },
  { from: "models.created_by", to: "users.id", rule: "SET NULL", color: "#f59e0b" },
  { from: "datasets.created_by", to: "users.id", rule: "SET NULL", color: "#f59e0b" },
  { from: "questions.id_dataset", to: "datasets.id_dataset", rule: "CASCADE", color: "#ef4444" },
  { from: "model_responses.id_question", to: "questions.id_question", rule: "CASCADE", color: "#ef4444" },
  { from: "model_responses.id_model", to: "models.id_model", rule: "CASCADE", color: "#ef4444" },
  { from: "reference_answers.question_id", to: "questions.id_question", rule: "CASCADE", color: "#ef4444" },
  { from: "reference_answers.judge_model_id", to: "judge_models.id_judge_model", rule: "CASCADE", color: "#ef4444" },
  { from: "judge_evaluations.id_response", to: "model_responses.id_response", rule: "CASCADE", color: "#ef4444" },
  { from: "judge_evaluations.judge_model_id", to: "judge_models.id_judge_model", rule: "CASCADE", color: "#ef4444" },
];

export function DbSchema() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#f0f4f8", minHeight: "100vh", padding: 28 }}>
      <h1 style={{ textAlign: "center", color: "#1a2e1a", marginBottom: 4, fontSize: 20, fontWeight: 800 }}>🗄️ MedEval Judge — Database Schema</h1>
      <p style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginBottom: 20 }}>11 tables · PostgreSQL · Drizzle ORM</p>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20, flexWrap: "wrap" }}>
        {[["PK", "#fef3c7", "#92400e"], ["FK", "#dbeafe", "#1e40af"], ["UQ", "#f3e8ff", "#6d28d9"]].map(([label, bg, fg]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#374151" }}>
            <span style={{ background: bg, color: fg, fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>{label}</span>
            <span>{label === "PK" ? "Primary Key" : label === "FK" ? "Foreign Key" : "Unique"}</span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: "#6b7280" }}>🗑️ = ON DELETE CASCADE</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            {row.map(t => <TableCard key={t.name} table={t} />)}
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 10, padding: "18px 22px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginTop: 22 }}>
        <h3 style={{ fontSize: 12, color: "#374151", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 700 }}>🔗 Foreign Key Relationships</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 7 }}>
          {fks.map((fk, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "5px 10px", background: "#f9fafb", borderRadius: 6 }}>
              <span style={{ fontWeight: 600, color: "#16a34a" }}>{fk.from}</span>
              <span style={{ color: "#9ca3af" }}>→</span>
              <span style={{ fontWeight: 600, color: "#7c3aed" }}>{fk.to}</span>
              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 700, background: fk.color === "#ef4444" ? "#fee2e2" : "#fef3c7", color: fk.color, marginLeft: "auto", whiteSpace: "nowrap" }}>{fk.rule}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>🗑️ CASCADE = deleting parent deletes all children &nbsp;|&nbsp; SET NULL = deleting user keeps the data, clears ownership</p>
      </div>
    </div>
  );
}
