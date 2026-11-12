
import { useState } from "react";
import {
  WandSparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Save,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Bug,
  Trash2,
} from "lucide-react";

const API_BASE = "http://localhost:8000";

type Finding = {
  severity: string;
  category: string;
  line: number;
  issue: string;
  explanation: string;
  recommendation: string;
};

type FixResult = {
  status: string;
  filename: string;
  explanation: string;
  fixed_code: string;
  changes: string[];
};

type FixedAnalysisResult = {
  status: string;
  filename: string;
  metrics: {
    total_lines: number;
    code_lines: number;
    comment_lines: number;
    blank_lines: number;
    include_count: number;
    todo_count: number;
  };
  analyzed_at: string;
  report: string;
};

type ClangDiagnostic = {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  check: string;
};

type ClangTidyResult = {
  status: string;
  filename: string;
  total_diagnostics: number;
  warning_count: number;
  error_count: number;
  note_count: number;
  diagnostics: ClangDiagnostic[];
  analyzed_at: string;
};

type DeleteResult = {
  status: string;
  deleted_filename: string;
  original_source_preserved: boolean;
};

type Props = {
  filename: string;
  finding: Finding;
  originalCode: string;
};

type DiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
  originalLine?: number;
  fixedLine?: number;
};

// Generate line-by-line comparison using LCS.
function buildLineDiff(original: string, fixed: string): DiffLine[] {
  const oldLines = original.split(/\r?\n/);
  const newLines = fixed.split(/\r?\n/);

  if (oldLines.length > 1000 || newLines.length > 1000) {
    const diff: DiffLine[] = [];
    const max = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < max; i++) {
      if (
        i < oldLines.length &&
        i < newLines.length &&
        oldLines[i] === newLines[i]
      ) {
        diff.push({
          type: "unchanged",
          text: oldLines[i],
          originalLine: i + 1,
          fixedLine: i + 1,
        });
      } else {
        if (i < oldLines.length) {
          diff.push({
            type: "removed",
            text: oldLines[i],
            originalLine: i + 1,
          });
        }

        if (i < newLines.length) {
          diff.push({
            type: "added",
            text: newLines[i],
            fixedLine: i + 1,
          });
        }
      }
    }

    return diff;
  }

  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const matrix = new Uint32Array(rows * cols);

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      const index = i * cols + j;

      matrix[index] =
        oldLines[i] === newLines[j]
          ? 1 + matrix[(i + 1) * cols + (j + 1)]
          : Math.max(
              matrix[(i + 1) * cols + j],
              matrix[i * cols + (j + 1)]
            );
    }
  }

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      diff.push({
        type: "unchanged",
        text: oldLines[i],
        originalLine: i + 1,
        fixedLine: j + 1,
      });
      i++;
      j++;
    } else if (
      matrix[(i + 1) * cols + j] >=
      matrix[i * cols + (j + 1)]
    ) {
      diff.push({
        type: "removed",
        text: oldLines[i],
        originalLine: i + 1,
      });
      i++;
    } else {
      diff.push({
        type: "added",
        text: newLines[j],
        fixedLine: j + 1,
      });
      j++;
    }
  }

  while (i < oldLines.length) {
    diff.push({
      type: "removed",
      text: oldLines[i],
      originalLine: i + 1,
    });
    i++;
  }

  while (j < newLines.length) {
    diff.push({
      type: "added",
      text: newLines[j],
      fixedLine: j + 1,
    });
    j++;
  }

  return diff;
}

export default function AICodeFixer({
  filename,
  finding,
  originalCode,
}: Props) {
  const [result, setResult] = useState<FixResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState("");
  const [rollbackMessage, setRollbackMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);

  const [savedFilename, setSavedFilename] = useState("");

  const [analysisResult, setAnalysisResult] =
    useState<FixedAnalysisResult | null>(null);

  const [clangResult, setClangResult] =
    useState<ClangTidyResult | null>(null);

  // Generate AI correction.
  async function generateFix() {
    setLoading(true);
    setError("");
    setRollbackMessage("");
    setResult(null);
    setAccepted(false);
    setCopied(false);
    setSavedFilename("");
    setAnalysisResult(null);
    setClangResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/ai-fix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename,
          finding,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
  const errorData = data as { detail?: string };

  throw new Error(
    errorData.detail || "Unable to delete corrected file."
  );
}

      if (
        typeof data.fixed_code !== "string" ||
        !data.fixed_code.trim()
      ) {
        throw new Error("AI returned an empty corrected code result.");
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "AI code fix failed."
      );
    } finally {
      setLoading(false);
    }
  }

  // Copy corrected code.
  async function copyFixedCode() {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result.fixed_code);
      setCopied(true);
      setError("");
    } catch {
      setError(
        "Could not copy code. Check browser clipboard permissions."
      );
    }
  }

  // Save corrected code separately.
  async function saveFixedCode() {
    if (!result || saving || savedFilename) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/fixed-code/save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename,
            fixed_code: result.fixed_code,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to save corrected code."
        );
      }

      if (!data.fixed_filename) {
        throw new Error("Server did not return the saved filename.");
      }

      setSavedFilename(data.fixed_filename);
      setAnalysisResult(null);
      setClangResult(null);
      setRollbackMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save corrected code."
      );
    } finally {
      setSaving(false);
    }
  }

  // Re-analyse corrected code.
  async function analyzeFixedCode() {
    if (!savedFilename || analyzing) return;

    setAnalyzing(true);
    setError("");
    setAnalysisResult(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/fixed-code/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: savedFilename,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to analyse corrected code."
        );
      }

      if (!data.metrics || !data.report) {
        throw new Error("Analysis response is incomplete.");
      }

      setAnalysisResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fixed-code analysis failed."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  // Run Clang-Tidy.
  async function runClangTidy() {
    if (!savedFilename || checking) return;

    setChecking(true);
    setError("");
    setClangResult(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/fixed-code/clang-tidy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: savedFilename,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Clang-Tidy validation failed."
        );
      }

      if (!Array.isArray(data.diagnostics)) {
        throw new Error("Invalid Clang-Tidy diagnostics response.");
      }

      setClangResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Clang-Tidy validation failed."
      );
    } finally {
      setChecking(false);
    }
  }

  // Roll back by deleting only the generated fixed file.
  async function rollbackFixedCode() {
    if (!savedFilename || deleting) return;

    const confirmed = window.confirm(
      `Delete ${savedFilename} from the fixed-code directory?\n\n` +
      `The original file ${filename} will not be modified.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");
    setRollbackMessage("");

    try {
      const response = await fetch(
        `${API_BASE}/api/fixed-code/${encodeURIComponent(savedFilename)}`,
        {
          method: "DELETE",
        }
      );

      const data: DeleteResult | { detail?: string } =
        await response.json();

      if (!response.ok) {
  const errorData = data as { detail?: string };

  throw new Error(
    errorData.detail || "Unable to delete corrected file."
  );
}

      const deleteResult = data as DeleteResult;

      if (
        deleteResult.status !== "success" ||
        deleteResult.original_source_preserved !== true
      ) {
        throw new Error(
          "The server did not confirm successful rollback and original-file preservation."
        );
      }

      setRollbackMessage(
        `${deleteResult.deleted_filename} was deleted successfully. Original source ${filename} is preserved.`
      );

      setSavedFilename("");
      setAnalysisResult(null);
      setClangResult(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Rollback failed."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="ai-fixer-panel">

      {/* Header */}
      <div className="ai-fixer-heading">
        <div>
          <span className="ai-eyebrow">
            AI CODE REMEDIATION
          </span>

          <h3>
            <WandSparkles size={20} />
            AI Code Fixer
          </h3>

          <p>
            Generate a proposed correction for the selected finding.
          </p>
        </div>

        <button
          className="ai-review-button"
          onClick={generateFix}
          disabled={
            loading || saving || analyzing || checking || deleting
          }
        >
          {loading ? (
            <>
              <Loader2 size={16} className="ai-spinner" />
              Generating...
            </>
          ) : (
            <>
              <WandSparkles size={16} />
              Generate Fix
            </>
          )}
        </button>
      </div>

      {/* Finding details */}
      <div className="ai-fixer-issue">
        <div>
          <AlertTriangle size={17} />
          <strong>{finding.issue}</strong>
        </div>

        <p>{finding.recommendation}</p>

        <small>
          {finding.severity} | {finding.category} | Line {finding.line}
        </small>
      </div>

      {/* Errors */}
      {error && (
        <div className="ai-error">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      {/* Rollback success notification */}
{rollbackMessage && (
  <div
    role="status"
    style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "16px",
      marginTop: "16px",
      marginBottom: "16px",
      background: "#ecfdf5",
      color: "#166534",
      border: "1px solid #86efac",
      borderRadius: "10px",
      fontSize: "14px",
      fontWeight: 600,
    }}
  >
    <CheckCircle2 size={20} />
    <span>{rollbackMessage}</span>
  </div>
)}

      {/* Loading */}
      {loading && (
        <div className="ai-loading">
          <WandSparkles size={25} />
          <div>
            <strong>Generating corrected C++ code...</strong>
            <p>
              Qwen is analysing the finding and preparing a proposed fix.
            </p>
          </div>
        </div>
      )}

      {/* Generated result */}
      {result && (
        <>
          <div className="ai-fixer-explanation">
            <h4>Proposed correction</h4>
            <p>{result.explanation}</p>
          </div>

          {/* Diff Viewer */}
          <div className="ai-diff-panel">
            <div className="ai-diff-heading">
              <div>
                <h4>Code Diff Viewer</h4>
                <p>
                  Original code compared with AI-generated code
                </p>
              </div>

              <div className="ai-diff-legend">
                <span className="ai-diff-legend-removed">
                  - Removed
                </span>
                <span className="ai-diff-legend-added">
                  + Added
                </span>
                <span className="ai-diff-legend-unchanged">
                  Unchanged
                </span>
              </div>
            </div>

            <div className="ai-diff-code">
              {buildLineDiff(
                originalCode,
                result.fixed_code
              ).map((line, index) => (
                <div
                  key={index}
                  className={`ai-diff-line ai-diff-${line.type}`}
                >
                  <span className="ai-diff-number">
                    {line.originalLine ?? ""}
                  </span>

                  <span className="ai-diff-number">
                    {line.fixedLine ?? ""}
                  </span>

                  <span className="ai-diff-symbol">
                    {line.type === "added"
                      ? "+"
                      : line.type === "removed"
                        ? "-"
                        : " "}
                  </span>

                  <code>{line.text || " "}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Changes */}
          <div className="ai-fixer-changes">
            <h4>Changes made</h4>

            {result.changes.map((change, index) => (
              <div key={index}>
                <CheckCircle2 size={15} />
                {change}
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="ai-fixer-actions">

            <button
              className="ai-refresh-button"
              onClick={copyFixedCode}
            >
              <Copy size={15} />
              {copied ? "Code copied!" : "Copy corrected code"}
            </button>

            <button
              className="ai-review-button"
              onClick={() => setAccepted(true)}
              disabled={accepted}
            >
              <CheckCircle2 size={16} />
              {accepted ? "Marked as accepted" : "Accept suggestion"}
            </button>

            <button
              className="ai-review-button"
              onClick={saveFixedCode}
              disabled={saving || Boolean(savedFilename)}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="ai-spinner" />
                  Saving...
                </>
              ) : savedFilename ? (
                <>
                  <CheckCircle2 size={16} />
                  Saved successfully
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Fixed Version
                </>
              )}
            </button>

            <button
              className="ai-review-button"
              onClick={analyzeFixedCode}
              disabled={!savedFilename || analyzing}
            >
              {analyzing ? (
                <>
                  <Loader2 size={16} className="ai-spinner" />
                  Analysing...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Re-analyse Fixed Code
                </>
              )}
            </button>

            <button
              className="ai-review-button"
              onClick={runClangTidy}
              disabled={!savedFilename || checking}
            >
              {checking ? (
                <>
                  <Loader2 size={16} className="ai-spinner" />
                  Checking...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Run Clang-Tidy
                </>
              )}
            </button>

            {/* Rollback button */}
            <button
              className="ai-review-button"
              onClick={rollbackFixedCode}
              disabled={!savedFilename || deleting}
              style={{
                borderColor: "#dc4444",
                color: "#dc4444",
              }}
            >
              {deleting ? (
                <>
                  <Loader2 size={16} className="ai-spinner" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Rollback / Delete Fix
                </>
              )}
            </button>

          </div>

          {/* Saved status */}
          {savedFilename && (
            <div className="ai-fixer-accepted">
              <CheckCircle2 size={17} />

              <div>
                <strong>Corrected code saved successfully!</strong>
                <p>Generated file: {savedFilename}</p>
                <p>
                  Original file ({filename}) remains untouched.
                </p>
              </div>
            </div>
          )}

          {/* CortexCode Analysis Results */}
          {analysisResult && (
            <div className="ai-fixer-accepted">
              <div>
                <h4>CortexCode Re-analysis Results</h4>

                <p>Analysed file: {analysisResult.filename}</p>

                <div className="ai-fixer-changes">
                  <h4>Code Metrics</h4>
                  <div>Total Lines: {analysisResult.metrics.total_lines}</div>
                  <div>Code Lines: {analysisResult.metrics.code_lines}</div>
                  <div>Comment Lines: {analysisResult.metrics.comment_lines}</div>
                  <div>Blank Lines: {analysisResult.metrics.blank_lines}</div>
                  <div>Include Statements: {analysisResult.metrics.include_count}</div>
                  <div>TODO Comments: {analysisResult.metrics.todo_count}</div>
                </div>

                <h4>Analysis Report</h4>

                <pre style={{
                  whiteSpace: "pre-wrap",
                  overflowX: "auto",
                  fontSize: "12px",
                  lineHeight: 1.6,
                }}>
                  {analysisResult.report}
                </pre>

                <small>
                  Analysed at:{" "}
                  {new Date(analysisResult.analyzed_at).toLocaleString()}
                </small>
              </div>
            </div>
          )}

          {/* Clang-Tidy Results */}
          {clangResult && (
            <div
              className="ai-fixer-accepted"
              style={{ display: "block", marginTop: "20px" }}
            >
              <div className="ai-fixer-heading">
                <div>
                  <span className="ai-eyebrow">
                    STATIC CODE ANALYSIS
                  </span>

                  <h3>
                    <ShieldCheck size={20} />
                    Clang-Tidy Results
                  </h3>

                  <p>Diagnostics for {clangResult.filename}</p>
                </div>

                {clangResult.error_count === 0 ? (
                  <ShieldCheck size={28} />
                ) : (
                  <ShieldAlert size={28} />
                )}
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "12px",
                margin: "18px 0",
              }}>
                <div className="ai-fixer-issue">
                  <strong>{clangResult.total_diagnostics}</strong>
                  <p>Total diagnostics</p>
                </div>

                <div className="ai-fixer-issue">
                  <strong>{clangResult.warning_count}</strong>
                  <p>Warnings</p>
                </div>

                <div className="ai-fixer-issue">
                  <strong>{clangResult.error_count}</strong>
                  <p>Errors</p>
                </div>

                <div className="ai-fixer-issue">
                  <strong>{clangResult.note_count}</strong>
                  <p>Notes</p>
                </div>
              </div>

              <div className="ai-fixer-explanation">
                {clangResult.error_count === 0 ? (
                  <p>
                    <CheckCircle2 size={16} />
                    No Clang-Tidy errors reported. Review the warnings
                    for further code-quality improvements.
                  </p>
                ) : (
                  <p>
                    <AlertTriangle size={16} />
                    Clang-Tidy reported errors that require attention.
                  </p>
                )}
              </div>

              <h4>
                <Bug size={17} />
                Diagnostic Details
              </h4>

              {clangResult.diagnostics.length === 0 ? (
                <div className="ai-fixer-empty">
                  No diagnostics reported by Clang-Tidy.
                </div>
              ) : (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  marginTop: "14px",
                }}>
                  {clangResult.diagnostics.map((diagnostic, index) => (
                    <div
                      key={`${diagnostic.line}-${diagnostic.column}-${index}`}
                      className="ai-fixer-issue"
                      style={{
                        borderLeft: `4px solid ${
                          diagnostic.severity.toLowerCase() === "error"
                            ? "#ef4444"
                            : diagnostic.severity.toLowerCase() === "warning"
                              ? "#eab308"
                              : "#64748b"
                        }`,
                      }}
                    >
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}>
                        <strong>
                          {diagnostic.severity.toUpperCase()}
                        </strong>

                        <small>
                          Line {diagnostic.line}, Column {diagnostic.column}
                        </small>
                      </div>

                      <p style={{ marginTop: "10px" }}>
                        {diagnostic.message}
                      </p>

                      <small>Check: {diagnostic.check}</small>
                    </div>
                  ))}
                </div>
              )}

              <small>
                Checked at:{" "}
                {new Date(clangResult.analyzed_at).toLocaleString()}
              </small>
            </div>
          )}

          {/* Acceptance status */}
          {accepted && (
            <div className="ai-fixer-accepted">
              <CheckCircle2 size={17} />
              Suggestion accepted in this session. The original
              file has not been modified.
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="ai-fixer-empty">
          Generate a fix to compare the original and suggested C++ code.
        </div>
      )}

    </section>
  );
}
