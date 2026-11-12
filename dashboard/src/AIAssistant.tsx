import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Code2,
  Lightbulb,
  FileCode2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import "./AIAssistant.css";
import AICodeFixer from "./AICodeFixer";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type Finding = {
  severity: string;
  category: string;
  line: number;
  issue: string;
  explanation: string;
  recommendation: string;
};

type Optimization = {
  title: string;
  explanation: string;
  suggestion: string;
};

type Review = {
  summary: string;
  quality_score: number;
  findings: Finding[];
  optimizations: Optimization[];
};

type ReviewHistory = {
  id: number;
  filename: string;
  model: string;
  review: Review;
  analyzed_at: string;
};

type SourceFile = string | { filename?: string; name?: string };

export default function AIAssistant() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  useEffect(() => {
    void loadFiles();
    void loadHistory();
  }, []);

  async function loadFiles() {
    setLoadingFiles(true);
    try {
      const response = await fetch(`${API_BASE}/api/files`);
      if (!response.ok) throw new Error(`Could not load source files (HTTP ${response.status}).`);

      const data = await response.json();
      const rawFiles: SourceFile[] = Array.isArray(data) ? data : data.files ?? [];
      const names = rawFiles
        .map((file) => typeof file === "string" ? file : file.filename ?? file.name ?? "")
        .filter((name): name is string => Boolean(name));

      setFiles(names);
      setSelectedFile((current) => names.includes(current) ? current : names[0] ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load source files.");
    } finally {
      setLoadingFiles(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai-review/history`);
      if (!response.ok) throw new Error(`Could not load AI review history (HTTP ${response.status}).`);
      const data = await response.json();
      setHistory(data.history ?? []);
    } catch (err) {
      console.error("AI review history error:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadSourceCode(filename: string) {
    setSourceLoading(true);
    setSourceError("");
    setSourceCode(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/source/${encodeURIComponent(filename)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? `Could not load source code (HTTP ${response.status}).`);
      }

      if (typeof data.content !== "string") {
        throw new Error("The source endpoint did not return source code.");
      }

      setSourceCode(data.content);
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not load source code.");
    } finally {
      setSourceLoading(false);
    }
  }

  function showSourceLine(line: number) {
    setSelectedLine(line);
    window.setTimeout(() => {
      document.getElementById("ai-source-viewer")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  async function runReview() {
    if (!selectedFile) {
      setError("Select a C++ source file first.");
      return;
    }

    setReviewing(true);
    setError("");
    setReview(null);
    try {
      const response = await fetch(`${API_BASE}/api/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedFile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? `AI review failed (HTTP ${response.status}).`);
      if (!data.review || typeof data.review !== "object") {
        throw new Error("The AI endpoint returned an invalid review response.");
      }
      setReview(data.review);
      setSelectedLine(null);
      await loadSourceCode(selectedFile);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI review failed unexpectedly.");
    } finally {
      setReviewing(false);
    }
  }

  function severityClass(severity: string) {
    const value = severity.toLowerCase();
    if (value.includes("critical")) return "critical";
    if (value.includes("high")) return "high";
    if (value.includes("medium")) return "medium";
    if (value.includes("low")) return "low";
    return "info";
  }

  function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  return (
    <div className="ai-page">
      <div className="ai-heading">
        <div>
          <div className="ai-eyebrow"><Sparkles size={14} /> INTELLIGENT CODE REVIEW</div>
          <h1>AI <span>Assistant</span></h1>
          <p>Analyse your C++ code with locally hosted AI. Identify issues, improve quality and discover optimizations.</p>
        </div>
        <div className="ai-model-badge"><span className="ai-status-dot" /> Qwen 2.5 Coder 7B · Local</div>
      </div>

      <section className="ai-review-panel">
        <div className="ai-panel-heading">
          <div className="ai-panel-icon"><BrainCircuit size={22} /></div>
          <div><h2>Start AI Code Review</h2><p>Select a source file to begin analysis.</p></div>
        </div>

        <div className="ai-controls">
          <div className="ai-file-control">
            <label htmlFor="ai-source-file">SOURCE FILE</label>
            <select
              id="ai-source-file"
              value={selectedFile}
              onChange={(event) => {
                setSelectedFile(event.target.value);
                setReview(null);
                setSourceCode(null);
                setSourceError("");
                setSelectedLine(null);
                setError("");
              }}
              disabled={loadingFiles || files.length === 0}
            >
              {loadingFiles && <option value="">Loading files...</option>}
              {!loadingFiles && files.length === 0 && <option value="">No source files available</option>}
              {files.map((file) => <option key={file} value={file}>{file}</option>)}
            </select>
          </div>
          <button className="ai-review-button" onClick={runReview} disabled={reviewing || loadingFiles || !selectedFile}>
            {reviewing ? <><Loader2 size={17} className="ai-spinner" /> Reviewing...</> : <><Sparkles size={17} /> Run AI Review</>}
          </button>
        </div>

        {error && <div className="ai-error"><AlertTriangle size={17} /> {error}</div>}
        {reviewing && (
          <div className="ai-loading">
            <BrainCircuit size={30} />
            <div><strong>AI is analysing your code...</strong><p>Reviewing code quality, potential bugs and optimization opportunities. This may take a few minutes.</p></div>
          </div>
        )}
      </section>

      {review && (
        <div className="ai-results">
          <div className="ai-results-heading">
            <div><span className="ai-eyebrow">ANALYSIS COMPLETE</span><h2>Review Results</h2><p>{selectedFile}</p></div>
            <button className="ai-refresh-button" onClick={runReview} disabled={reviewing}><RefreshCw size={15} /> Review Again</button>
          </div>

          <div className="ai-summary-grid">
            <div className="ai-score-card"><span>CODE QUALITY SCORE</span><strong>{review.quality_score ?? "N/A"}</strong><small>AI-generated assessment</small></div>
            <div className="ai-stat-card"><AlertTriangle size={20} /><strong>{review.findings?.length ?? 0}</strong><span>Findings</span></div>
            <div className="ai-stat-card"><Lightbulb size={20} /><strong>{review.optimizations?.length ?? 0}</strong><span>Optimizations</span></div>
          </div>

          <section className="ai-result-card">
            <h3><BrainCircuit size={19} /> AI Summary</h3>
            <p className="ai-summary-text">{review.summary || "No summary was returned."}</p>
          </section>

          <section className="ai-result-card ai-source-card" id="ai-source-viewer">
            <div className="ai-source-heading">
              <div>
                <h3><FileCode2 size={19} /> Source Code</h3>
                <p>Click a finding's line number to highlight the corresponding source line.</p>
              </div>
              {selectedLine !== null && <span className="ai-selected-line-label">Line {selectedLine} selected</span>}
            </div>

            {sourceLoading ? (
              <p className="ai-empty">Loading source code...</p>
            ) : sourceError ? (
              <div className="ai-error"><AlertTriangle size={17} /> {sourceError}</div>
            ) : sourceCode !== null ? (
              <div className="ai-code-scroll">
                <div className="ai-source-code">
                  {sourceCode.split(/\r?\n/).map((line, index) => {
                    const lineNumber = index + 1;
                    return (
                      <div
                        className={`ai-code-line ${selectedLine === lineNumber ? "is-highlighted" : ""}`}
                        id={`ai-source-line-${lineNumber}`}
                        key={lineNumber}
                      >
                        <span className="ai-code-line-number">{lineNumber}</span>
                        <code>{line || " "}</code>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="ai-empty">Source code will appear after a successful review.</p>
            )}
          </section>

          <section className="ai-result-card">
            <h3><ShieldAlert size={19} /> Code Findings</h3>
            {review.findings?.length ? (
              <div className="ai-findings">
                {review.findings.map((finding, index) => (
                  <article className="ai-finding" key={`${finding.line}-${index}`}>
                    <div className="ai-finding-top">
                      <span className={`ai-severity ${severityClass(finding.severity ?? "info")}`}>{finding.severity ?? "Info"}</span>
                      <span className="ai-category">{finding.category ?? "General"}</span>
                      <button
                        type="button"
                        className="ai-line ai-line-button"
                        onClick={() => Number.isInteger(finding.line) && finding.line > 0 && showSourceLine(finding.line)}
                        disabled={!Number.isInteger(finding.line) || finding.line <= 0}
                        title="Show this line in the source code"
                      >
                        Line {finding.line ?? "—"} · View source
                      </button>
                    </div>
                    <h4>{finding.issue ?? "Unspecified issue"}</h4>
                    <p>{finding.explanation ?? "No explanation provided."}</p>
                    <div className="ai-recommendation"><strong>Recommendation</strong><p>{finding.recommendation ?? "No recommendation provided."}</p></div>
                    {sourceCode !== null && (
  <AICodeFixer
    filename={selectedFile}
    finding={finding}
    originalCode={sourceCode}
  />
)}
                  </article>
                ))}
              </div>
            ) : <p className="ai-empty">No code findings were returned.</p>}
          </section>

          <section className="ai-result-card">
            <h3><Code2 size={19} /> Optimization Suggestions</h3>
            {review.optimizations?.length ? (
              <div className="ai-optimizations">
                {review.optimizations.map((item, index) => (
                  <article className="ai-optimization" key={index}>
                    <div className="ai-optimization-number">{String(index + 1).padStart(2, "0")}</div>
                    <div><h4>{item.title}</h4><p>{item.explanation}</p><div className="ai-suggestion">{item.suggestion}</div></div>
                  </article>
                ))}
              </div>
            ) : <p className="ai-empty">No optimization suggestions were returned.</p>}
          </section>
        </div>
      )}

      <section className="ai-history-panel">
        <div className="ai-history-heading">
          <div><h2><Clock3 size={19} /> Previous AI Reviews</h2><p>Your saved AI code review history.</p></div>
          <button className="ai-refresh-button" onClick={loadHistory} disabled={loadingHistory}><RefreshCw size={15} /> Refresh</button>
        </div>

        {loadingHistory ? <p className="ai-empty">Loading review history...</p> : history.length === 0 ? (
          <div className="ai-empty-state"><FileCode2 size={30} /><strong>No previous reviews</strong><p>Your completed AI reviews will appear here.</p></div>
        ) : (
          <div className="ai-history-list">
            {history.map((item) => (
              <article className="ai-history-item" key={item.id}>
                <div className="ai-history-file-icon"><FileCode2 size={19} /></div>
                <div className="ai-history-info"><strong>{item.filename}</strong><span>{item.model} · {formatDate(item.analyzed_at)}</span></div>
                <div className="ai-history-score"><CheckCircle2 size={15} /> {item.review?.quality_score ?? "N/A"}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
