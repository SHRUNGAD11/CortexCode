
import json
import re
import sqlite3
import subprocess

from urllib.request import Request as URLRequest, urlopen
from urllib.error import URLError, HTTPError

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from fastapi.responses import JSONResponse
from starlette.requests import Request

import logging

logger = logging.getLogger("cortexcode")

# ============================================================
# APPLICATION CONFIGURATION
# ============================================================

app = FastAPI(
    title="CortexCode API",
    description="AI-Powered C++ Code Intelligence Platform",
    version="1.4.0"
)

logger = logging.getLogger("cortexcode")


@app.exception_handler(Exception)
async def global_exception_handler(
    request: Request,
    exc: Exception
):
    logger.exception(
        "Unhandled exception: %s %s",
        request.method,
        request.url.path
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected server error occurred. Please try again."
        }
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5176",
        "http://127.0.0.1:5176"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ============================================================
# PROJECT PATHS
# ============================================================
# ============================================================
# LOCAL AI CONFIGURATION
# ============================================================

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "qwen2.5-coder:7b"

PROJECT_ROOT = Path(__file__).resolve().parents[2]

ENGINE_PATH = (
    PROJECT_ROOT
    / "cpp-engine"
    / "build"
    / "cortexcode.exe"
)

SAMPLE_DIR = (
    PROJECT_ROOT
    / "sample-code"
).resolve()
FIXED_DIR = (
    PROJECT_ROOT
    / "fixed-code"
).resolve()

DATABASE_PATH = (
    PROJECT_ROOT
    / "backend"
    / "cortexcode.db"
)

CLANG_TIDY_PATH = Path(
    r"C:\msys64\ucrt64\bin\clang-tidy.exe"
)


# ============================================================
# REQUEST MODELS
# ============================================================

class AnalysisRequest(BaseModel):
    filename: str

class AIFindingInput(BaseModel):
    severity: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    line: int = Field(..., ge=1)
    issue: str = Field(..., min_length=1)
    explanation: str = Field(..., min_length=1)
    recommendation: str = Field(..., min_length=1)

    @field_validator(
        "severity",
        "category",
        "issue",
        "explanation",
        "recommendation"
    )
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value


class AIFixRequest(BaseModel):
    filename: str
    finding: AIFindingInput

class SaveFixRequest(BaseModel):
    filename: str
    fixed_code: str


# ============================================================
# DATABASE CONNECTION
# ============================================================

@contextmanager
def get_connection():

    connection = sqlite3.connect(
        DATABASE_PATH,
        timeout=10
    )

    connection.row_factory = sqlite3.Row

    try:
        yield connection
        connection.commit()

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def initialize_database():

    DATABASE_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with get_connection() as connection:

        # C++ Engine Analysis History
        connection.execute("""
            CREATE TABLE IF NOT EXISTS analysis_history (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                filename TEXT NOT NULL,

                total_lines INTEGER,
                code_lines INTEGER,
                comment_lines INTEGER,
                blank_lines INTEGER,
                include_count INTEGER,
                todo_count INTEGER,

                analyzed_at TEXT NOT NULL
            )
        """)

        # Clang-Tidy Analysis History
        connection.execute("""
            CREATE TABLE IF NOT EXISTS clang_tidy_history (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                filename TEXT NOT NULL,

                total_diagnostics INTEGER,
                warning_count INTEGER,
                error_count INTEGER,
                note_count INTEGER,

                diagnostics_json TEXT NOT NULL,

                raw_output TEXT,

                analyzed_at TEXT NOT NULL
            )
        """)

        # AI Code Review History
        connection.execute("""
            CREATE TABLE IF NOT EXISTS ai_review_history (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                filename TEXT NOT NULL,

                model TEXT NOT NULL,

                review_json TEXT NOT NULL,

                analyzed_at TEXT NOT NULL

            )
        """)


initialize_database()


# ============================================================
# COMMON HELPERS
# ============================================================

def get_timestamp():

    return datetime.now(
        timezone.utc
    ).isoformat()



def validate_source_file(filename: str) -> Path:
    if not filename or Path(filename).name != filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename."
        )

    if not filename.lower().endswith(".cpp"):
        raise HTTPException(
            status_code=400,
            detail="Only .cpp files are supported."
        )

    source_file = (SAMPLE_DIR / filename).resolve()

    try:
        source_file.relative_to(SAMPLE_DIR)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="File is outside the sample-code directory."
        )

    if not source_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="Source file not found."
        )

    return source_file


def validate_fixed_file(filename: str) -> Path:
    if not filename or Path(filename).name != filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid fixed filename."
        )

    if not filename.lower().endswith(".cpp"):
        raise HTTPException(
            status_code=400,
            detail="Only .cpp files are supported."
        )

    fixed_file = (FIXED_DIR / filename).resolve()

    try:
        fixed_file.relative_to(FIXED_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="File is outside the fixed-code directory."
        )

    if not fixed_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="Fixed file not found."
        )

    return fixed_file

# ============================================================
# LOCAL AI CODE REVIEW ENGINE
# ============================================================

def call_ollama(prompt: str):

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.2
        }
    }

    request = URLRequest(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urlopen(request, timeout=240) as response:
            result = json.loads(response.read().decode("utf-8"))

        return result["response"]

    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama HTTP error: {error.code}"
        )

    except URLError as error:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Ollama: {error.reason}"
        )

    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="AI review timed out."
        )


# ============================================================
# AI CODE REVIEW API
# ============================================================

@app.post("/api/ai-review")
def ai_code_review(request: AnalysisRequest):

    source_file = validate_source_file(request.filename)

    try:
        source_code = source_file.read_text(encoding="utf-8")

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read source file: {error}"
        )

    if len(source_code) > 30000:
        raise HTTPException(
            status_code=413,
            detail="Source file is too large for this review endpoint."
        )

    if not source_code.strip():
        raise HTTPException(
            status_code=400,
            detail="Source file is empty."
        )

    prompt = """
You are an expert C++ software engineer and security reviewer.

Review the supplied C++ source code carefully.

Identify:
1. Programming bugs and logical errors.
2. Memory management problems.
3. Security vulnerabilities.
4. Performance and optimization opportunities.
5. Code quality and maintainability problems.

Only report issues supported by the supplied code.
Do not invent vulnerabilities or claim that unverified code is incorrect.
If no issue is found in a category, say so.

Return ONLY valid JSON using this exact structure:

{
  "summary": "Overall review summary",
  "quality_score": 0,
  "findings": [
    {
      "severity": "High",
      "category": "Memory Safety",
      "line": 10,
      "issue": "Description of the issue",
      "explanation": "Why this is problematic",
      "recommendation": "How to fix it"
    }
  ],
  "optimizations": [
    {
      "title": "Optimization title",
      "explanation": "Why this optimization helps",
      "suggestion": "Recommended improvement"
    }
  ]
}

Severity must be one of:
Critical, High, Medium, Low, Info.

Quality score must be an integer from 0 to 100.

If there are no findings, return an empty findings array.

The line numbers must refer to the supplied source code.
Do not execute the source code.

SOURCE CODE:

""" + source_code

    ai_response = call_ollama(prompt)

    try:
        review = json.loads(ai_response)

        if not isinstance(review, dict):
            raise ValueError("Review must be a JSON object.")

        if not isinstance(review.get("findings"), list):
            raise ValueError("Invalid findings structure.")

        if not isinstance(review.get("optimizations"), list):
            raise ValueError("Invalid optimizations structure.")

    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned an invalid review format: {error}"
        )

    analyzed_at = get_timestamp()

    with get_connection() as connection:

        cursor = connection.execute("""
            INSERT INTO ai_review_history (
                filename,
                model,
                review_json,
                analyzed_at
            )
            VALUES (?, ?, ?, ?)
        """, (
            request.filename,
            OLLAMA_MODEL,
            json.dumps(review),
            analyzed_at
        ))

        review_id = cursor.lastrowid

    return {
        "status": "success",
        "review_id": review_id,
        "filename": request.filename,
        "model": OLLAMA_MODEL,
        "review": review,
        "analyzed_at": analyzed_at
    }



def parse_engine_metrics(output: str):

    patterns = {
        "total_lines": r"Total Lines\s*:\s*(\d+)",
        "code_lines": r"Code Lines\s*:\s*(\d+)",
        "comment_lines": r"Comment Lines\s*:\s*(\d+)",
        "blank_lines": r"Blank Lines\s*:\s*(\d+)",
        "include_count": r"Include Statements\s*:\s*(\d+)",
        "todo_count": r"TODO Comments\s*:\s*(\d+)"
    }

    metrics = {}

    for key, pattern in patterns.items():

        match = re.search(
            pattern,
            output,
            re.IGNORECASE
        )

        if not match:
            raise ValueError(
                f"Could not parse metric: {key}"
            )

        metrics[key] = int(match.group(1))

    return metrics


# ============================================================
# CLANG-TIDY DIAGNOSTIC PARSER
# ============================================================

def parse_clang_diagnostics(output: str):

    diagnostics = []

    pattern = re.compile(
        r"^(.*?):(\d+):(\d+):\s*"
        r"(warning|error|note):\s*"
        r"(.*?)(?:\s+\[([^\]]+)\])?$"
    )

    for line in output.splitlines():

        match = pattern.match(line.strip())

        if not match:
            continue

        file_path, line_number, column, severity, message, check = (
            match.groups()
        )

        diagnostics.append({
            "file": file_path,
            "line": int(line_number),
            "column": int(column),
            "severity": severity,
            "message": message.strip(),
            "check": check or "unknown"
        })

    return diagnostics


# ============================================================
# ROOT ENDPOINT
# ============================================================

@app.get("/")
def root():

    return {
        "name": "CortexCode API",
        "version": "1.4.0",
        "status": "running",
        "description": (
            "AI-Powered C++ Code Intelligence "
            "and Software Engineering Platform"
        )
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health_check():

    return {
        "status": "healthy",
        "engine_exists": ENGINE_PATH.is_file(),
        "clang_tidy_exists": CLANG_TIDY_PATH.is_file(),
        "database_exists": DATABASE_PATH.is_file()
    }


# ============================================================
# AVAILABLE SOURCE FILES
# ============================================================

@app.get("/api/files")
def get_files():

    if not SAMPLE_DIR.exists():
        return {
            "status": "success",
            "files": [],
            "count": 0
        }

    files = sorted([
        file.name
        for file in SAMPLE_DIR.glob("*.cpp")
        if file.is_file()
    ])

    return {
        "status": "success",
        "files": files,
        "count": len(files)
    }


# ============================================================
# SOURCE CODE RETRIEVAL
# ============================================================

@app.get("/api/source/{filename}")
def get_source_code(filename: str):

    source_file = validate_source_file(filename)

    try:
        source_code = source_file.read_text(
            encoding="utf-8"
        )
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=422,
            detail="Source file is not valid UTF-8."
        )

    return {
        "status": "success",
        "filename": filename,
        "content": source_code,
        "total_lines": len(source_code.splitlines())
    }


# ============================================================
# C++ ENGINE ANALYSIS
# ============================================================

@app.post("/api/analyze")
def analyze_code(request: AnalysisRequest):

    if not ENGINE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="C++ analysis engine not found. Build the engine first."
        )

    source_file = validate_source_file(
        request.filename
    )

    try:

        result = subprocess.run(
            [
                str(ENGINE_PATH),
                str(source_file)
            ],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(PROJECT_ROOT),
            check=False
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail="C++ analysis timed out."
        )

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not execute C++ engine: {error}"
        )

    if result.returncode != 0:

        raise HTTPException(
            status_code=500,
            detail={
                "message": "C++ engine execution failed.",
                "output": result.stderr
            }
        )

    output = result.stdout

    try:
        metrics = parse_engine_metrics(output)

    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    analyzed_at = get_timestamp()

    # Save analysis in SQLite
    with get_connection() as connection:

        cursor = connection.execute("""
            INSERT INTO analysis_history (

                filename,

                total_lines,
                code_lines,
                comment_lines,
                blank_lines,
                include_count,
                todo_count,

                analyzed_at

            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.filename,

            metrics["total_lines"],
            metrics["code_lines"],
            metrics["comment_lines"],
            metrics["blank_lines"],
            metrics["include_count"],
            metrics["todo_count"],

            analyzed_at
        ))

        analysis_id = cursor.lastrowid

    return {
        "status": "success",
        "analysis_id": analysis_id,
        "filename": request.filename,
        "metrics": metrics,
        "analyzed_at": analyzed_at,
        "report": output
    }


# ============================================================
# CLANG-TIDY STATIC ANALYSIS
# ============================================================

@app.post("/api/clang-tidy")
def run_clang_tidy(request: AnalysisRequest):

    if not CLANG_TIDY_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Clang-Tidy executable not found."
        )

    source_file = validate_source_file(
        request.filename
    )

    try:

        result = subprocess.run(
            [
                str(CLANG_TIDY_PATH),
                str(source_file),
                "--quiet",
                "--",
                "-std=c++17"
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(PROJECT_ROOT),
            check=False
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail="Clang-Tidy analysis timed out."
        )

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not execute Clang-Tidy: {error}"
        )

    # Clang-Tidy diagnostics are commonly written to stderr.
    output = "\n".join(
        part for part in [
            result.stdout,
            result.stderr
        ] if part
    )

    diagnostics = parse_clang_diagnostics(
        output
    )

    warning_count = sum(
        1 for item in diagnostics
        if item["severity"] == "warning"
    )

    error_count = sum(
        1 for item in diagnostics
        if item["severity"] == "error"
    )

    note_count = sum(
        1 for item in diagnostics
        if item["severity"] == "note"
    )

    total_diagnostics = len(diagnostics)

    analyzed_at = get_timestamp()

    # --------------------------------------------------------
    # SAVE CLANG-TIDY RESULTS TO SQLITE
    # --------------------------------------------------------

    with get_connection() as connection:

        cursor = connection.execute("""
            INSERT INTO clang_tidy_history (

                filename,

                total_diagnostics,
                warning_count,
                error_count,
                note_count,

                diagnostics_json,
                raw_output,

                analyzed_at

            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.filename,

            total_diagnostics,
            warning_count,
            error_count,
            note_count,

            json.dumps(diagnostics),
            output,

            analyzed_at
        ))

        clang_analysis_id = cursor.lastrowid

    return {
        "status": "success",

        "analysis_id": clang_analysis_id,

        "filename": request.filename,

        "total_diagnostics": total_diagnostics,

        "warning_count": warning_count,
        "error_count": error_count,
        "note_count": note_count,

        "diagnostics": diagnostics,

        "raw_output": output,

        "process_return_code": result.returncode,

        "analyzed_at": analyzed_at
    }


# ============================================================
# C++ ENGINE ANALYSIS HISTORY
# ============================================================

@app.get("/api/history")
def get_analysis_history():

    with get_connection() as connection:

        rows = connection.execute("""
            SELECT *
            FROM analysis_history
            ORDER BY id DESC
            LIMIT 50
        """).fetchall()

    history = [
        dict(row)
        for row in rows
    ]

    return {
        "status": "success",
        "count": len(history),
        "history": history
    }


# ============================================================
# SINGLE C++ ANALYSIS RECORD
# ============================================================

@app.get("/api/history/{analysis_id}")
def get_analysis_by_id(analysis_id: int):

    with get_connection() as connection:

        row = connection.execute("""
            SELECT *
            FROM analysis_history
            WHERE id = ?
        """, (analysis_id,)).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis record not found."
        )

    return {
        "status": "success",
        "analysis": dict(row)
    }


# ============================================================
# CLANG-TIDY ANALYSIS HISTORY
# ============================================================

@app.get("/api/clang-tidy/history")
def get_clang_tidy_history():

    with get_connection() as connection:

        rows = connection.execute("""
            SELECT *
            FROM clang_tidy_history
            ORDER BY id DESC
            LIMIT 50
        """).fetchall()

    history = []

    for row in rows:

        record = dict(row)

        record["diagnostics"] = json.loads(
            record.pop("diagnostics_json")
        )

        history.append(record)

    return {
        "status": "success",
        "count": len(history),
        "history": history
    }


# ============================================================
# SINGLE CLANG-TIDY ANALYSIS RECORD
# ============================================================

@app.get("/api/clang-tidy/history/{analysis_id}")
def get_clang_tidy_analysis_by_id(analysis_id: int):

    with get_connection() as connection:

        row = connection.execute("""
            SELECT *
            FROM clang_tidy_history
            WHERE id = ?
        """, (analysis_id,)).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Clang-Tidy analysis record not found."
        )

    record = dict(row)

    record["diagnostics"] = json.loads(
        record.pop("diagnostics_json")
    )

    return {
        "status": "success",
        "analysis": record
    }

# ============================================================
# AI REVIEW HISTORY API
# ============================================================

@app.get("/api/ai-review/history")
def get_ai_review_history():

    with get_connection() as connection:

        rows = connection.execute("""
            SELECT *
            FROM ai_review_history
            ORDER BY id DESC
            LIMIT 50
        """).fetchall()

    history = []

    for row in rows:

        record = dict(row)

        record["review"] = json.loads(
            record.pop("review_json")
        )

        history.append(record)

    return {
        "status": "success",
        "count": len(history),
        "history": history
    }


@app.get("/api/ai-review/history/{review_id}")
def get_ai_review_by_id(review_id: int):

    with get_connection() as connection:

        row = connection.execute("""
            SELECT *
            FROM ai_review_history
            WHERE id = ?
        """, (review_id,)).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="AI review not found."
        )

    record = dict(row)

    record["review"] = json.loads(
        record.pop("review_json")
    )

    return {
        "status": "success",
        "review": record
    }


# ============================================================
# AI CODE FIXER
# ============================================================

@app.post("/api/ai-fix")
def generate_ai_fix(request: AIFixRequest):

    source_file = validate_source_file(request.filename)

    try:
        original_code = source_file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=422,
            detail="Source file is not valid UTF-8."
        )

    if not original_code.strip():
        raise HTTPException(
            status_code=400,
            detail="Source file is empty."
        )

    if len(original_code) > 30000:
        raise HTTPException(
            status_code=413,
            detail="Source file exceeds the 30,000 character limit."
        )

    finding = request.finding.model_dump()

    prompt = f"""
You are an expert C++ software engineer.

Your task is to fix one specific issue in the supplied C++ source code.

IMPORTANT RULES:
1. Fix the specified finding.
2. Preserve all unrelated functionality.
3. Preserve the existing program structure wherever possible.
4. Do not remove unrelated code or comments.
5. Do not invent APIs or dependencies.
6. Return the COMPLETE corrected C++ source file.
7. Do not use Markdown code fences.

FINDING:
{json.dumps(finding, indent=2)}

ORIGINAL FILENAME:
{request.filename}

ORIGINAL C++ SOURCE CODE:
{original_code}

Return ONLY valid JSON using this structure:

{{
    "explanation": "Explain the correction.",
    "fixed_code": "Complete corrected C++ source code.",
    "changes": [
        "Description of change 1",
        "Description of change 2"
    ]
}}
"""

    try:
        raw_response = call_ollama(prompt)
        fix = json.loads(raw_response)

        if not isinstance(fix, dict):
            raise ValueError("AI response must be a JSON object.")

        fixed_code = fix.get("fixed_code")

        if not isinstance(fixed_code, str) or not fixed_code.strip():
            raise ValueError("AI did not return corrected source code.")

        if not isinstance(fix.get("changes", []), list):
            raise ValueError("AI changes must be a list.")

        return {
            "status": "success",
            "filename": request.filename,
            "finding": finding,
            "explanation": fix.get("explanation", ""),
            "fixed_code": fixed_code,
            "changes": fix.get("changes", [])
        }

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid JSON response."
        )
    except ValueError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error)
        )


# ============================================================
# SAFE AI FIX APPLICATION
# ============================================================

@app.post("/api/fixed-code/save")
def save_fixed_code(request: SaveFixRequest):

    # Confirm that the original source file exists.
    source_file = validate_source_file(request.filename)

    if not request.fixed_code.strip():
        raise HTTPException(
            status_code=400,
            detail="Corrected code cannot be empty."
        )

    if len(request.fixed_code) > 30000:
        raise HTTPException(
            status_code=413,
            detail="Corrected code exceeds the 30,000 character limit."
        )

    try:
        FIXED_DIR.mkdir(parents=True, exist_ok=True)

        original_stem = source_file.stem
        counter = 1

        # Never overwrite an existing generated file.
        while True:

            suffix = (
                "_fixed"
                if counter == 1
                else f"_fixed_{counter}"
            )

            generated_name = f"{original_stem}{suffix}.cpp"
            generated_file = FIXED_DIR / generated_name

            try:
                with generated_file.open(
                    "x",
                    encoding="utf-8"
                ) as file:
                    file.write(request.fixed_code)

                break

            except FileExistsError:
                counter += 1

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not save corrected code: {error}"
        )

    return {
        "status": "success",
        "message": "Corrected code saved without modifying the original.",
        "original_filename": request.filename,
        "fixed_filename": generated_name,
        "fixed_directory": str(FIXED_DIR)
    }


# ============================================================
# VALIDATE GENERATED FIXED FILES
# ============================================================

def validate_fixed_file(filename: str) -> Path:

    if not filename or Path(filename).name != filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid fixed filename."
        )

    if not filename.lower().endswith(".cpp"):
        raise HTTPException(
            status_code=400,
            detail="Only .cpp files are supported."
        )

    fixed_file = (FIXED_DIR / filename).resolve()

    try:
        fixed_file.relative_to(FIXED_DIR)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="File is outside the fixed-code directory."
        )

    if not fixed_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="Fixed file not found."
        )

    return fixed_file


# ============================================================
# RE-ANALYZE GENERATED CODE USING CORTEXCODE ENGINE
# ============================================================

@app.post("/api/fixed-code/analyze")
def analyze_fixed_code(request: AnalysisRequest):

    if not ENGINE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="C++ analysis engine not found."
        )

    fixed_file = validate_fixed_file(request.filename)

    try:
        result = subprocess.run(
            [
                str(ENGINE_PATH),
                str(fixed_file)
            ],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(PROJECT_ROOT),
            check=False
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail="Fixed-code analysis timed out."
        )

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not execute C++ engine: {error}"
        )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "C++ engine execution failed.",
                "output": result.stderr
            }
        )

    try:
        metrics = parse_engine_metrics(result.stdout)

    except ValueError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    return {
        "status": "success",
        "filename": request.filename,
        "metrics": metrics,
        "analyzed_at": get_timestamp(),
        "report": result.stdout
    }


# ============================================================
# RUN CLANG-TIDY ON GENERATED CODE
# ============================================================

@app.post("/api/fixed-code/clang-tidy")
def analyze_fixed_code_clang_tidy(request: AnalysisRequest):

    if not CLANG_TIDY_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Clang-Tidy executable not found."
        )

    fixed_file = validate_fixed_file(request.filename)

    try:
        result = subprocess.run(
            [
                str(CLANG_TIDY_PATH),
                str(fixed_file),
                "--quiet",
                "--",
                "-std=c++17"
            ],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(PROJECT_ROOT),
            check=False
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail="Clang-Tidy analysis timed out."
        )

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not execute Clang-Tidy: {error}"
        )

    output = "\n".join(
        part for part in [
            result.stdout,
            result.stderr
        ] if part
    )

    diagnostics = parse_clang_diagnostics(output)

    warning_count = sum(
        1 for item in diagnostics
        if item["severity"] == "warning"
    )

    error_count = sum(
        1 for item in diagnostics
        if item["severity"] == "error"
    )

    note_count = sum(
        1 for item in diagnostics
        if item["severity"] == "note"
    )

    return {
        "status": "success",
        "filename": request.filename,
        "total_diagnostics": len(diagnostics),
        "warning_count": warning_count,
        "error_count": error_count,
        "note_count": note_count,
        "diagnostics": diagnostics,
        "analyzed_at": get_timestamp()
    }


# ============================================================
# ROLLBACK GENERATED CODE
# ============================================================

@app.delete("/api/fixed-code/{filename}")
def rollback_fixed_code(filename: str):

    fixed_file = validate_fixed_file(filename)

    # Only allow deletion of files following our generated naming pattern.
    stem = Path(filename).stem

    if not (
        stem.endswith("_fixed")
        or "_fixed_" in stem
    ):
        raise HTTPException(
            status_code=400,
            detail="This file is not a recognized generated fix."
        )

    try:
        fixed_file.unlink()

    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not remove generated file: {error}"
        )

    return {
        "status": "success",
        "message": "Generated corrected file removed.",
        "deleted_filename": filename,
        "original_source_preserved": True
    }
