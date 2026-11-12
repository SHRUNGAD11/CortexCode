# CortexCode

### AI-Powered C++ Code Intelligence Platform

CortexCode is a code intelligence platform designed to analyse C++ source code, identify potential issues, provide AI-powered code reviews, and generate corrected code.

It combines a native C++ analysis engine, Clang-Tidy static analysis, a local AI coding model, and a React-based dashboard into one integrated development environment.

## Features

- **C++ Code Analysis:** Analyse C++ source files using a custom-built C++ engine.
- **Static Analysis:** Integrate Clang-Tidy to identify code quality issues and diagnostics.
- **AI Code Review:** Generate contextual findings, explanations, and recommendations using a local AI model.
- **AI Code Correction:** Generate corrected C++ source code based on review findings.
- **Safe Code Management:** Save corrected code separately without overwriting original source files.
- **Re-analysis:** Run the analysis engine and Clang-Tidy against corrected files.
- **Analysis History:** Store and retrieve previous analysis results.
- **Rollback:** Remove generated corrected files when no longer needed.

## Technology Stack

| Component | Technology |
|---|---|
| Analysis engine | C++ |
| Build system | CMake |
| Static analysis | Clang-Tidy |
| Backend | Python, FastAPI |
| Frontend | React, TypeScript |
| Styling | CSS |
| Database | SQLite |
| Local AI | Ollama, Qwen 2.5 Coder 7B |
| Frontend build | Vite |

## Project Structure

```text
CortexCode/
├── backend/
│   └── app/
│       └── main.py
├── cpp-engine/
│   ├── include/
│   ├── src/
│   └── CMakeLists.txt
├── dashboard/
│   ├── public/
│   ├── src/
│   └── package.json
├── sample-code/
├── fixed-code/
├── .clang-tidy
└── .gitignore
```

## Prerequisites

- Windows development environment
- Python and pip
- Node.js and npm
- CMake
- C++ compiler
- Clang-Tidy
- Ollama
- Qwen 2.5 Coder 7B model

## Local Setup

### 1. Clone the repository

```powershell
git clone https://github.com/YOUR_USERNAME/CortexCode.git
cd CortexCode
```

### 2. Build the C++ engine

```powershell
cd cpp-engine
cmake -S . -B build -G "MinGW Makefiles"
cmake --build build
cd ..
```

### 3. Start the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

### 4. Start the AI service

Install and start Ollama, then pull the model:

```powershell
ollama pull qwen2.5-coder:7b
```

Ensure the Ollama service is running.

### 5. Start the frontend

Open another terminal:

```powershell
cd dashboard
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

## Configuration Notes

The current backend configuration uses local Windows paths for the C++ executable and Clang-Tidy. These paths must be adjusted when using a different development environment.

Ollama must be running locally for AI-powered features.

## Project Status

CortexCode has completed its planned prototype functionality and testing phase. Production deployment and cross-platform configuration are separate future activities.

## License

No open-source license has been assigned yet. All rights are reserved by the project owner unless a license is added.
