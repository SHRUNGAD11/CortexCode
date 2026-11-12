
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  BrainCircuit,
  Code2,
  FolderCode,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Zap,
  Search,
  Bell,
  ChevronDown,
  ArrowUpRight,
  CircleCheck,
  Clock3,
  AlertTriangle,
  Play,
  Terminal,
  Cpu,
  FileCode2,
  Sparkles,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";

import "./App.css";

import AIAssistant from "./AIAssistant";

const API_BASE = "http://localhost:8000";

type AnalysisResult = {
  status: string;
  filename: string;
  metrics: {
    total_lines: number | null;
    code_lines: number | null;
    comment_lines: number | null;
    blank_lines: number | null;
    include_count: number | null;
    todo_count: number | null;
  };
  raw_report: string;
};

type FileListResponse = {
  status: string;
  count: number;
  files: string[];
};

type HistoryRecord = {
  id: number;
  filename: string;
  total_lines: number | null;
  code_lines: number | null;
  comment_lines: number | null;
  blank_lines: number | null;
  include_count: number | null;
  todo_count: number | null;
  analyzed_at: string;
};

type HistoryResponse = {
  status: string;
  count: number;
  history: HistoryRecord[];
};

type ClangTidyDiagnostic = {
  file: string;
  line: number;
  column: number;
  severity: "warning" | "error" | "note";
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
  diagnostics: ClangTidyDiagnostic[];
  raw_output: string;
  process_return_code: number;
};

type ClangTidyHistoryRecord = {
  id: number;
  filename: string;
  total_diagnostics: number;
  warning_count: number;
  error_count: number;
  note_count: number;
  diagnostics: ClangTidyDiagnostic[];
  raw_output: string | null;
  analyzed_at: string;
};

type ClangTidyHistoryResponse = {
  status: string;
  count: number;
  history: ClangTidyHistoryRecord[];
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function App() {
  const [active, setActive] = useState("Overview");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const [analysisResult, setAnalysisResult] =
    useState<AnalysisResult | null>(null);

  const [clangTidyResult, setClangTidyResult] =
    useState<ClangTidyResult | null>(null);

  const [runningClangTidy, setRunningClangTidy] = useState(false);

  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [analysisHistory, setAnalysisHistory] = useState<HistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [clangTidyHistory, setClangTidyHistory] = useState<
    ClangTidyHistoryRecord[]
  >([]);
  const [loadingClangTidyHistory, setLoadingClangTidyHistory] =
    useState(false);
  const [selectedClangHistoryId, setSelectedClangHistoryId] = useState<
    number | null
  >(null);

  const [apiOnline, setApiOnline] = useState(false);

  // Load available C++ files.
  async function loadFiles() {
    setLoadingFiles(true);

    try {
      const response = await fetch(`${API_BASE}/api/files`);

      if (!response.ok) {
        throw new Error(`File request failed: HTTP ${response.status}`);
      }

      const data: FileListResponse = await response.json();

      setAvailableFiles(data.files);

      setSelectedFile((current) => {
        if (data.files.includes(current)) {
          return current;
        }

        return data.files[0] ?? "";
      });

      setApiOnline(true);

      setNotice(
        data.files.length > 0
          ? `${data.count} C++ source file(s) available.`
          : "Backend connected, but no C++ files were found."
      );
    } catch (error) {
      setApiOnline(false);

      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to load C++ files. Check the backend."
      );
    } finally {
      setLoadingFiles(false);
    }
  }

  // Load persisted SQLite analysis history.
  async function loadHistory() {
    setLoadingHistory(true);

    try {
      const response = await fetch(`${API_BASE}/api/history`);

      if (!response.ok) {
        throw new Error(`History request failed: HTTP ${response.status}`);
      }

      const data: HistoryResponse = await response.json();

      setAnalysisHistory(data.history);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to load analysis history."
      );
    } finally {
      setLoadingHistory(false);
    }
  }

  // Load persisted Clang-Tidy runs and their saved diagnostics.
  async function loadClangTidyHistory() {
    setLoadingClangTidyHistory(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/clang-tidy/history`
      );

      if (!response.ok) {
        throw new Error(
          `Clang-Tidy history request failed: HTTP ${response.status}`
        );
      }

      const data: ClangTidyHistoryResponse = await response.json();

      setClangTidyHistory(data.history);

      setSelectedClangHistoryId((current) => {
        if (
          current !== null &&
          data.history.some((item) => item.id === current)
        ) {
          return current;
        }

        return data.history[0]?.id ?? null;
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to load Clang-Tidy history."
      );
    } finally {
      setLoadingClangTidyHistory(false);
    }
  }

  useEffect(() => {
    void loadFiles();
    void loadHistory();
    void loadClangTidyHistory();
  }, []);

  // Run custom C++ analysis.
  async function runAnalysis() {
    if (!selectedFile) {
      setNotice("Select a C++ source file first.");
      return;
    }

    setRunning(true);
    setNotice("Sending source file to the C++ analysis engine...");

    try {
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: selectedFile,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "C++ analysis failed.");
      }

      setAnalysisResult(data);
      setApiOnline(true);

      await loadHistory();

      setNotice(`Successfully analysed ${data.filename}.`);
    } catch (error) {
      setAnalysisResult(null);

      setNotice(
        error instanceof Error
          ? `Analysis error: ${error.message}`
          : "An unexpected analysis error occurred."
      );
    } finally {
      setRunning(false);
    }
  }

  // Run Clang-Tidy static analysis.
  async function runClangTidy() {
    if (!selectedFile) {
      setNotice("Select a C++ source file first.");
      return;
    }

    setRunningClangTidy(true);
    setNotice("Running Clang-Tidy static analysis...");

    try {
      const response = await fetch(`${API_BASE}/api/clang-tidy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: selectedFile,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Clang-Tidy analysis failed.");
      }

      setClangTidyResult(data as ClangTidyResult);
      setApiOnline(true);

      // Refresh persisted history after the new run is saved.
      await loadClangTidyHistory();

      setNotice(`Clang-Tidy completed for ${data.filename}.`);
    } catch (error) {
      setClangTidyResult(null);

      setNotice(
        error instanceof Error
          ? `Clang-Tidy error: ${error.message}`
          : "An unexpected Clang-Tidy error occurred."
      );
    } finally {
      setRunningClangTidy(false);
    }
  }

  // Calculate actual dashboard statistics.
  const filteredAnalyses = analysisHistory.filter((item) =>
    item.filename.toLowerCase().includes(search.toLowerCase())
  );

  const uniqueFilesAnalysed = new Set(
    analysisHistory.map((item) => item.filename)
  ).size;

  const totalTodoComments = analysisHistory.reduce(
    (total, item) => total + (item.todo_count ?? 0),
    0
  );

  const selectedClangHistory =
    clangTidyHistory.find(
      (item) => item.id === selectedClangHistoryId
    ) ?? null;

  const navigation = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Code Analysis", icon: Code2 },
    { label: "Projects", icon: FolderCode },
    { label: "AI Assistant", icon: BrainCircuit },
  ];

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <BrainCircuit size={23} />
          </div>

          <div>
            <h2>CortexCode</h2>
            <span>CODE INTELLIGENCE</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`nav-item ${
                  active === item.label ? "active" : ""
                }`}
                onClick={() => {
                  setActive(item.label);
                  setMobileOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>

                {item.label === "AI Assistant" && (
                  <span className="nav-tag">AI</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="workspace-label tools-label">
          DEVELOPMENT TOOLS
        </div>

        <nav className="nav-list">
          <button
            className="nav-item"
            onClick={() => setNotice("Terminal module is planned.")}
          >
            <Terminal size={18} />
            <span>Terminal</span>
          </button>

          <button
            className="nav-item"
            onClick={() => setNotice("Security module is planned.")}
          >
            <ShieldCheck size={18} />
            <span>Security</span>
          </button>

          <button
            className="nav-item"
            onClick={() => setNotice("Settings module is planned.")}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="engine-card">
            <div className="engine-heading">
              <span className={`live-dot ${apiOnline ? "" : "offline"}`} />
              <span>ENGINE STATUS</span>
            </div>

            <h3>C++ Analysis Engine</h3>

            <p>
              {apiOnline
                ? "Backend connected"
                : "Connection not verified"}
            </p>

            <div className="engine-progress">
              <span className={apiOnline ? "progress-online" : ""} />
            </div>

            <small>
              {apiOnline
                ? "API connection available"
                : "Check FastAPI server"}
            </small>
          </div>

          <div className="profile">
            <div className="avatar">CC</div>

            <div className="profile-text">
              <strong>Developer</strong>
              <span>Local workspace</span>
            </div>

            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{active}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="system-status">
              <span className={`live-dot ${apiOnline ? "" : "offline"}`} />

              {apiOnline
                ? "Backend connected"
                : "Backend not verified"}
            </div>

            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setNotice("No new notifications.")}
            >
              <Bell size={18} />
            </button>

            <div className="top-avatar">D</div>
          </div>
        </header>

        <div className="content">
          {active === "AI Assistant" ? (
            <AIAssistant />
          ) : (
            <>
          {/* WELCOME */}
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                DEVELOPER WORKSPACE
              </div>

              <h1>
                Code intelligence, <span>elevated.</span>
              </h1>

              <p className="welcome-description">
                Analyse, understand and improve your C++ code
                with an AI-assisted engineering workflow.
              </p>
            </div>

            <div className="analysis-controls">
              <div className="file-selector">
                <label htmlFor="cpp-file">SOURCE FILE</label>

                <select
                  id="cpp-file"
                  value={selectedFile}
                  onChange={(event) => {
                    setSelectedFile(event.target.value);
                    setAnalysisResult(null);
                    setClangTidyResult(null);
                  }}
                  disabled={loadingFiles || availableFiles.length === 0}
                >
                  {availableFiles.length === 0 && (
                    <option value="">No C++ files available</option>
                  )}

                  {availableFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="refresh-button"
                  onClick={loadFiles}
                  disabled={loadingFiles}
                  aria-label="Refresh source files"
                >
                  <RefreshCw
                    size={15}
                    className={loadingFiles ? "spin" : ""}
                  />
                </button>
              </div>

              <button
                className="primary-button"
                onClick={runAnalysis}
                disabled={
                  running || loadingFiles || !selectedFile
                }
              >
                {running ? (
                  <Activity size={17} className="spin" />
                ) : (
                  <Play size={16} />
                )}

                {running ? "Analysing..." : "Run Analysis"}
              </button>

              <button
                className="primary-button"
                onClick={runClangTidy}
                disabled={
                  runningClangTidy || loadingFiles || !selectedFile
                }
              >
                {runningClangTidy ? (
                  <Activity size={17} className="spin" />
                ) : (
                  <ShieldCheck size={16} />
                )}

                {runningClangTidy
                  ? "Checking..."
                  : "Run Clang-Tidy"}
              </button>
            </div>
          </section>

          {/* NOTICE */}
          {notice && (
            <div className="notice">
              <span>{notice}</span>

              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* CUSTOM C++ ENGINE RESULTS */}
          {analysisResult && (
            <section className="panel live-results">
              <div className="panel-heading">
                <div>
                  <h3>Live C++ analysis results</h3>
                  <p>
                    Actual output returned by the CortexCode C++ engine
                  </p>
                </div>

                <span className="live-result-status">
                  <span className="live-dot" />
                  SUCCESS
                </span>
              </div>

              <p className="result-filename">
                Analysed file:{" "}
                <strong>{analysisResult.filename}</strong>
              </p>

              <div className="result-grid">
                <ResultMetric
                  label="Total lines"
                  value={analysisResult.metrics.total_lines}
                />

                <ResultMetric
                  label="Code lines"
                  value={analysisResult.metrics.code_lines}
                />

                <ResultMetric
                  label="Comment lines"
                  value={analysisResult.metrics.comment_lines}
                />

                <ResultMetric
                  label="Blank lines"
                  value={analysisResult.metrics.blank_lines}
                />

                <ResultMetric
                  label="Include statements"
                  value={analysisResult.metrics.include_count}
                />

                <ResultMetric
                  label="TODO comments"
                  value={analysisResult.metrics.todo_count}
                />
              </div>

              <details className="raw-report">
                <summary>View complete C++ engine report</summary>
                <pre>{analysisResult.raw_report}</pre>
              </details>
            </section>
          )}

          {/* CLANG-TIDY STATIC ANALYSIS RESULTS */}
          {clangTidyResult && (
            <section className="panel live-results clang-results">
              <div className="panel-heading">
                <div>
                  <h3>Clang-Tidy static analysis</h3>
                  <p>
                    Compiler-assisted diagnostics for{" "}
                    {clangTidyResult.filename}
                  </p>
                </div>

                <span className="live-result-status">
                  <span className="live-dot" />
                  COMPLETED
                </span>
              </div>

              <div className="result-grid">
                <ResultMetric
                  label="Total diagnostics"
                  value={clangTidyResult.total_diagnostics}
                />

                <ResultMetric
                  label="Warnings"
                  value={clangTidyResult.warning_count}
                />

                <ResultMetric
                  label="Errors"
                  value={clangTidyResult.error_count}
                />

                <ResultMetric
                  label="Notes"
                  value={clangTidyResult.note_count}
                />
              </div>

              <div className="analysis-list clang-diagnostic-list">
                {clangTidyResult.diagnostics.map((item, index) => (
                  <div
                    className="analysis-row clang-diagnostic-row"
                    key={`${item.file}-${item.line}-${item.column}-${item.check}-${index}`}
                  >
                    <div className="file-icon">
                      <AlertTriangle size={18} />
                    </div>

                    <div className="analysis-file">
                      <strong>{item.message}</strong>
                      <span>{item.check}</span>
                    </div>

                    <div className="status">
                      <span />
                      {item.severity}
                    </div>

                    <div className="time">
                      <FileCode2 size={13} />
                      {item.file}:{item.line}:{item.column}
                    </div>
                  </div>
                ))}

                {clangTidyResult.diagnostics.length === 0 && (
                  <div className="empty-state">
                    No structured diagnostics were returned for this file.
                    Check the raw output for additional details.
                  </div>
                )}
              </div>

              <details className="raw-report">
                <summary>View complete Clang-Tidy output</summary>
                <pre>{clangTidyResult.raw_output}</pre>
              </details>
            </section>
          )}

          {/* PERSISTED CLANG-TIDY HISTORY */}
          <section className="panel analyses-panel clang-history-panel">
            <div className="panel-heading">
              <div>
                <h3>Clang-Tidy analysis history</h3>
                <p>
                  Previous static-analysis runs retrieved from SQLite
                </p>
              </div>

              <button
                type="button"
                className="refresh-button"
                onClick={loadClangTidyHistory}
                disabled={loadingClangTidyHistory}
                aria-label="Refresh Clang-Tidy history"
              >
                <RefreshCw
                  size={15}
                  className={loadingClangTidyHistory ? "spin" : ""}
                />
              </button>
            </div>

            <div className="table-toolbar">
              <span className="record-count">
                {clangTidyHistory.length} saved run(s)
              </span>
              {selectedClangHistory && (
                <span className="record-count">
                  Selected run #{selectedClangHistory.id}
                </span>
              )}
            </div>

            <div className="analysis-list">
              {clangTidyHistory.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`analysis-row clang-history-row ${
                    selectedClangHistoryId === item.id
                      ? "clang-history-selected"
                      : ""
                  }`}
                  onClick={() => setSelectedClangHistoryId(item.id)}
                  aria-pressed={selectedClangHistoryId === item.id}
                >
                  <div className="file-icon">
                    <ShieldCheck size={18} />
                  </div>

                  <div className="analysis-file">
                    <strong>{item.filename}</strong>
                    <span>
                      Run #{item.id} · {formatDate(item.analyzed_at)}
                    </span>
                  </div>

                  <div className="status">
                    <span />
                    Saved
                  </div>

                  <div className="score">
                    {item.warning_count}
                    <small> warnings</small>
                  </div>

                  <div className="time">
                    <span>{item.error_count} errors</span>
                    <span> · {item.note_count} notes</span>
                  </div>
                </button>
              ))}

              {clangTidyHistory.length === 0 && (
                <div className="empty-state">
                  {loadingClangTidyHistory
                    ? "Loading saved Clang-Tidy runs..."
                    : "No Clang-Tidy history yet. Run Clang-Tidy to save your first record."}
                </div>
              )}
            </div>

            {selectedClangHistory && (
              <div className="clang-history-details">
                <div className="panel-heading">
                  <div>
                    <h3>
                      Saved diagnostics — {selectedClangHistory.filename}
                    </h3>
                    <p>
                      Run #{selectedClangHistory.id} ·{" "}
                      {formatDate(selectedClangHistory.analyzed_at)}
                    </p>
                  </div>
                </div>

                <div className="result-grid">
                  <ResultMetric
                    label="Total diagnostics"
                    value={selectedClangHistory.total_diagnostics}
                  />
                  <ResultMetric
                    label="Warnings"
                    value={selectedClangHistory.warning_count}
                  />
                  <ResultMetric
                    label="Errors"
                    value={selectedClangHistory.error_count}
                  />
                  <ResultMetric
                    label="Notes"
                    value={selectedClangHistory.note_count}
                  />
                </div>

                <div className="analysis-list clang-diagnostic-list">
                  {selectedClangHistory.diagnostics.map((item, index) => (
                    <div
                      className="analysis-row clang-diagnostic-row"
                      key={`${selectedClangHistory.id}-${item.file}-${item.line}-${item.column}-${index}`}
                    >
                      <div className="file-icon">
                        <AlertTriangle size={18} />
                      </div>

                      <div className="analysis-file">
                        <strong>{item.message}</strong>
                        <span>{item.check}</span>
                      </div>

                      <div className="status">
                        <span />
                        {item.severity}
                      </div>

                      <div className="time">
                        <FileCode2 size={13} />
                        {item.file}:{item.line}:{item.column}
                      </div>
                    </div>
                  ))}

                  {selectedClangHistory.diagnostics.length === 0 && (
                    <div className="empty-state">
                      No structured diagnostics were saved for this run.
                      Check the raw output below for additional details.
                    </div>
                  )}
                </div>

                {selectedClangHistory.raw_output && (
                  <details className="raw-report">
                    <summary>View saved Clang-Tidy output</summary>
                    <pre>{selectedClangHistory.raw_output}</pre>
                  </details>
                )}
              </div>
            )}
          </section>

          {/* HERO */}
          <section className="hero-card">
            <div className="hero-glow" />

            <div className="hero-content">
              <div className="hero-pill">
                <Sparkles size={13} />
                INTELLIGENT CODE WORKFLOW
              </div>

              <h2>
                Build better software.
                <br />
                <span>Understand every line.</span>
              </h2>

              <p>
                A unified workspace for C++ source analysis,
                code quality insights, performance investigations
                and AI-assisted reviews.
              </p>

              <button
                className="hero-button"
                onClick={() => setActive("Code Analysis")}
              >
                Explore code analysis
                <ArrowUpRight size={16} />
              </button>
            </div>

            <div className="hero-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />

              <div className="core-icon">
                <BrainCircuit size={54} />
              </div>

              <div className="float-chip chip-one">
                <Code2 size={16} /> C++
              </div>

              <div className="float-chip chip-two">
                <Zap size={16} /> AI Review
              </div>

              <div className="float-chip chip-three">
                <ShieldCheck size={16} /> Quality
              </div>
            </div>

            <div className="hero-index">
              01 <span>/ 04</span>
            </div>
          </section>

          {/* OVERVIEW */}
          <section className="section-heading">
            <div>
              <h2>Workspace overview</h2>
              <p>
                Live statistics calculated from saved SQLite analysis records.
              </p>
            </div>

            <span className="preview-label">LIVE DATABASE</span>
          </section>

          <section className="metrics-grid">
            <MetricCard
              icon={<FolderCode />}
              label="Projects analysed"
              value={String(uniqueFilesAnalysed)}
              change="Unique source files analysed"
            />

            <MetricCard
              icon={<Activity />}
              label="Analysis runs"
              value={String(analysisHistory.length)}
              change="Saved analysis runs"
            />

            <MetricCard
              icon={<AlertTriangle />}
              label="TODO comments found"
              value={String(totalTodoComments)}
              change="Across saved analysis runs"
            />

            <MetricCard
              icon={<CircleCheck />}
              label="Latest analysis"
              value={
                analysisHistory.length
                  ? `#${analysisHistory[0].id}`
                  : "—"
              }
              change={
                analysisHistory[0]
                  ? analysisHistory[0].filename
                  : "No records yet"
              }
            />
          </section>

          {/* LOWER GRID */}
          <section className="lower-grid">
            <div className="panel analyses-panel">
              <div className="panel-heading">
                <div>
                  <h3>Analysis history</h3>
                  <p>
                    Saved analysis runs retrieved from the SQLite database
                  </p>
                </div>

                <button
                  type="button"
                  className="refresh-button"
                  onClick={loadHistory}
                  disabled={loadingHistory}
                  aria-label="Refresh analysis history"
                >
                  <RefreshCw
                    size={15}
                    className={loadingHistory ? "spin" : ""}
                  />
                </button>
              </div>

              <div className="table-toolbar">
                <div className="search-box">
                  <Search size={16} />

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search analysed files..."
                  />
                </div>

                <span className="record-count">
                  {filteredAnalyses.length} records
                </span>
              </div>

              <div className="analysis-list">
                {filteredAnalyses.map((item) => (
                  <div className="analysis-row" key={item.id}>
                    <div className="file-icon">
                      <FileCode2 size={18} />
                    </div>

                    <div className="analysis-file">
                      <strong>{item.filename}</strong>
                      <span>
                        {item.total_lines ?? "—"} lines ·{" "}
                        {item.code_lines ?? "—"} code
                      </span>
                    </div>

                    <div className="status">
                      <span />
                      Saved
                    </div>

                    <div className="score">
                      {item.todo_count ?? "—"}
                      <small> TODO</small>
                    </div>

                    <div className="time">
                      <Clock3 size={13} />
                      {formatDate(item.analyzed_at)}
                    </div>
                  </div>
                ))}

                {filteredAnalyses.length === 0 && (
                  <div className="empty-state">
                    {loadingHistory
                      ? "Loading saved analysis records..."
                      : search
                        ? "No matching analysis records."
                        : "No analysis history yet. Run an analysis to create your first record."}
                  </div>
                )}
              </div>
            </div>

            <div className="right-column">
              <div className="panel insight-panel">
                <div className="insight-title">
                  <div className="insight-icon">
                    <BrainCircuit size={18} />
                  </div>

                  <div>
                    <h3>AI insights</h3>
                    <span>PLANNED INTEGRATION</span>
                  </div>
                </div>

                <div className="insight-body">
                  <div className="insight-symbol">
                    <Sparkles size={19} />
                  </div>

                  <h4>Your AI reviewer is coming.</h4>

                  <p>
                    Local Ollama integration provides code explanations,
                    review suggestions and optimization recommendations.
                  </p>
                </div>

                <button
                  className="insight-button"
                  onClick={() => setActive("AI Assistant")}
                >
                  Explore AI assistant
                  <ArrowUpRight size={15} />
                </button>
              </div>

              <div className="panel environment-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Development stack</h3>
                    <p>Project components</p>
                  </div>

                  <Cpu size={18} className="muted-icon" />
                </div>

                <div className="stack-list">
                  <StackItem
                    name="C++ Analysis Engine"
                    detail="Local executable"
                    status="Ready"
                  />

                  <StackItem
                    name="React + TypeScript"
                    detail="Dashboard"
                    status="Ready"
                  />

                  <StackItem
                    name="FastAPI"
                    detail="Backend API"
                    status="Ready"
                  />

                  <StackItem
                    name="Ollama (Qwen 2.5 Coder)"
                    detail="Local AI code review"
                    status="Ready"
                  />
                </div>
              </div>
            </div>
          </section>

          <footer className="footer">
            <span>
              CORTEXCODE
              <span className="footer-separator">·</span>
              CODE INTELLIGENCE PLATFORM
            </span>

            <span>
              Development preview
              <span className="footer-separator">·</span>
              v0.3.0
            </span>
          </footer>
        </>
      )}
        </div>
      </main>
    </div>
  );
}

// Reusable metric card.
function MetricCard({
  icon,
  label,
  value,
  change,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  change: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <div className="metric-icon">{icon}</div>
        <span className="metric-period">LIVE</span>
      </div>

      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-change">{change}</div>
    </div>
  );
}

// Reusable development stack item.
function StackItem({
  name,
  detail,
  status,
}: {
  name: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="stack-item">
      <div className="stack-indicator">
        <span />
      </div>

      <div className="stack-copy">
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>

      <span
        className={`stack-status ${
          status === "Ready" ? "ready" : ""
        }`}
      >
        {status}
      </span>
    </div>
  );
}

// Reusable live analysis metric.
function ResultMetric({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="result-metric">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export default App;
