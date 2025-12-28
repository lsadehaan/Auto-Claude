# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Server

The web server is deployed at:
- **Hostname**: `claude` (SSH: `ssh root@claude`)
- **URL**: https://claude.praiaradical.com
- **Location**: `/opt/auto-claude/`
- **Web Server PID**: `/tmp/auto-claude-web.pid`
- **Web Server Log**: `/tmp/auto-claude-web.log`

### Deployment Process (CRITICAL - Follow Exactly)

**Always use the restart script to avoid running old code:**

```bash
# Deploy latest code and restart (one command)
ssh root@claude '/usr/local/bin/restart-web'

# Verify deployment worked:
ssh root@claude 'curl -s http://localhost:3001/api/health | grep timestamp'
# Compare timestamp with current time - should be within last 2 minutes
```

**NEVER manually restart** - the restart script ensures:
1. Latest code is pulled
2. Clean rebuild (dist/ removed)
3. Server restart with new code
4. Proper logging setup

## Project Overview

Auto Claude is a multi-agent autonomous coding framework that builds software through coordinated AI agent sessions. It uses the Claude Code SDK to run agents in isolated workspaces with security controls.

## Commands

### Setup

**Requirements:**
- Python 3.10+ (required for backend)
- Node.js 24+ (for frontend)

```bash
# Install all dependencies from root
npm run install:all

# Or install separately:
# Backend (from apps/backend/)
cd apps/backend && uv venv && uv pip install -r requirements.txt

# Frontend (from apps/frontend/)
cd apps/frontend && npm install

# Set up OAuth token
claude setup-token
# Add to apps/backend/.env: CLAUDE_CODE_OAUTH_TOKEN=your-token
```

### Troubleshooting Backend Issues

**CRITICAL: Always verify the Python backend is properly configured before debugging frontend issues!**

```bash
# 1. Check Python backend dependencies are installed
cd apps/backend
python run.py --help  # Should show help without errors

# If you see "ModuleNotFoundError", install dependencies:
cd apps/backend
uv venv  # Create virtual environment (if not exists)
uv pip install -r requirements.txt  # Install all dependencies

# 2. Verify Python backend can run
cd apps/backend
python run.py --list  # Should list specs (or show empty if none exist)

# 3. Check backend environment (.env file)
cat apps/backend/.env  # Should contain CLAUDE_CODE_OAUTH_TOKEN

# 4. Test spec creation manually
cd apps/backend
python run.py --create-spec --task "test task" --project-dir /path/to/project
# Should create spec in .auto-claude/specs/ directory

# 5. Verify specs are created on disk
ls -la /path/to/project/.auto-claude/specs/
# Should show spec directories after creation

# 6. Check web server backend connection
# Web server spawns Python processes - verify it can find python and run.py
cd apps/web-server
npm run dev  # Check logs for "Python: python" and "Backend: /path/to/backend"
```

**Common Backend Issues:**
- **Missing dependencies**: Run `uv pip install -r requirements.txt` in apps/backend
- **No OAuth token**: Set `CLAUDE_CODE_OAUTH_TOKEN` in apps/backend/.env
- **Python not found**: Web server can't find python executable
- **Specs not created**: Python backend crashing silently - check process logs
- **Empty task list**: Specs directory doesn't exist or is empty

### Creating and Running Specs
```bash
cd apps/backend

# Create a spec via Claude Code slash command
claude /spec

# Run autonomous build
python run.py --spec 001

# List all specs
python run.py --list
```

### Workspace Management
```bash
cd apps/backend

# Review changes in isolated worktree
python run.py --spec 001 --review

# Merge completed build into project
python run.py --spec 001 --merge

# Discard build
python run.py --spec 001 --discard
```

### QA Validation
```bash
cd apps/backend

# Run QA manually
python run.py --spec 001 --qa

# Check QA status
python run.py --spec 001 --qa-status
```

### Testing
```bash
# Install test dependencies (required first time)
cd apps/backend && uv pip install -r ../../tests/requirements-test.txt

# Run all tests (use virtual environment pytest)
apps/backend/.venv/bin/pytest tests/ -v

# Run single test file
apps/backend/.venv/bin/pytest tests/test_security.py -v

# Run specific test
apps/backend/.venv/bin/pytest tests/test_security.py::test_bash_command_validation -v

# Skip slow tests
apps/backend/.venv/bin/pytest tests/ -m "not slow"

# Or from root
npm run test:backend
```

### Spec Validation
```bash
cd apps/backend
python -m spec.validate_spec --spec-dir specs/001-feature --checkpoint all
```

### Releases
```bash
# 1. Bump version on your branch (creates commit, no tag)
node scripts/bump-version.js patch   # 2.8.0 -> 2.8.1
node scripts/bump-version.js minor   # 2.8.0 -> 2.9.0
node scripts/bump-version.js major   # 2.8.0 -> 3.0.0

# 2. Push and create PR to main
git push origin your-branch
gh pr create --base main

# 3. Merge PR → GitHub Actions automatically:
#    - Creates tag
#    - Builds all platforms
#    - Creates release with changelog
#    - Updates README
```

See [RELEASE.md](RELEASE.md) for detailed release process documentation.

## Architecture

### Core Pipeline

**Spec Creation (`claude /spec` → `spec/` package)** - Dynamic 3-8 phase pipeline based on task complexity:
- SIMPLE (3 phases): Discovery → Quick Spec → Validate
- STANDARD (6-7 phases): Discovery → Requirements → [Research] → Context → Spec → Plan → Validate
- COMPLEX (8 phases): Full pipeline with Research and Self-Critique phases

**Implementation (`run.py` → `agent.py`)** - Multi-session build:
1. Planner Agent creates subtask-based implementation plan
2. Coder Agent implements subtasks (can spawn subagents for parallel work)
3. QA Reviewer validates acceptance criteria
4. QA Fixer resolves issues in a loop

### Key Components (apps/backend/)

- **cli/** - Modular CLI: `main.py` (routing), `build_commands.py`, `workspace_commands.py`, `qa_commands.py`
- **spec/** - Spec creation pipeline: `phases/`, `pipeline/`, `validate_pkg/`
- **memory/** - File-based session memory: `sessions.py`, `patterns.py`, `codebase_map.py`
- **client.py** - Claude SDK client with security hooks and tool permissions
- **security.py** + **project_analyzer.py** - Dynamic command allowlisting based on detected project stack
- **worktree.py** - Git worktree isolation for safe feature development
- **graphiti_providers.py** - Multi-provider factory for Graphiti (OpenAI, Anthropic, Azure, Ollama, Google AI)
- **graphiti_config.py** - Configuration and validation for Graphiti integration
- **linear_updater.py** - Optional Linear integration for progress tracking

### Agent Prompts (apps/backend/prompts/)

| Prompt | Purpose |
|--------|---------|
| planner.md | Creates implementation plan with subtasks |
| coder.md | Implements individual subtasks |
| coder_recovery.md | Recovers from stuck/failed subtasks |
| qa_reviewer.md | Validates acceptance criteria |
| qa_fixer.md | Fixes QA-reported issues |
| spec_gatherer.md | Collects user requirements |
| spec_researcher.md | Validates external integrations |
| spec_writer.md | Creates spec.md document |
| spec_quick.md | Quick spec for simple tasks |
| spec_critic.md | Self-critique using ultrathink |
| complexity_assessor.md | AI-based complexity assessment |
| followup_planner.md | Plans follow-up tasks after build |
| ideation_*.md | Discovery prompts for improvements, security, performance |

### Spec Directory Structure

Each spec in `.auto-claude/specs/XXX-name/` contains:
- `spec.md` - Feature specification
- `requirements.json` - Structured user requirements
- `context.json` - Discovered codebase context
- `implementation_plan.json` - Subtask-based plan with status tracking
- `qa_report.md` - QA validation results
- `QA_FIX_REQUEST.md` - Issues to fix (when rejected)

### Branching & Worktree Strategy

Auto Claude uses git worktrees for isolated builds. All branches stay LOCAL until user explicitly pushes:

```
main (user's branch)
└── auto-claude/{spec-name}  ← spec branch (isolated worktree)
```

**Key principles:**
- ONE branch per spec (`auto-claude/{spec-name}`)
- Parallel work uses subagents (agent decides when to spawn)
- NO automatic pushes to GitHub - user controls when to push
- User reviews in spec worktree (`.worktrees/{spec-name}/`)
- Final merge: spec branch → main (after user approval)

**Workflow:**
1. Build runs in isolated worktree on spec branch
2. Agent implements subtasks (can spawn subagents for parallel work)
3. User tests feature in `.worktrees/{spec-name}/`
4. User runs `--merge` to add to their project
5. User pushes to remote when ready

### Security Model

Three-layer defense:
1. **OS Sandbox** - Bash command isolation
2. **Filesystem Permissions** - Operations restricted to project directory
3. **Command Allowlist** - Dynamic allowlist from project analysis (security.py + project_analyzer.py)

Security profile cached in `.auto-claude-security.json`.

### Memory System

Dual-layer memory architecture:

**File-Based Memory (Primary)** - `memory/` package
- Zero dependencies, always available
- Human-readable files in `specs/XXX/memory/`
- Session insights, patterns, gotchas, codebase map

**Graphiti Memory** - `query_memory.py` + `graphiti_*.py`
- Graph database with semantic search (LadybugDB - embedded, no Docker)
- Cross-session context retrieval
- Multi-provider support:
  - LLM: OpenAI, Anthropic, Azure OpenAI, Ollama, Google AI (Gemini)
  - Embedders: OpenAI, Voyage AI, Azure OpenAI, Ollama, Google AI
- Configure with provider credentials in `.env.example`

## Project Structure

```
auto-claude/
├── apps/
│   ├── backend/           # Python backend/CLI (the framework code)
│   └── frontend/          # Electron desktop UI
├── guides/                # Documentation
├── tests/                 # Test suite
└── scripts/               # Build and utility scripts
```

**As a standalone CLI tool**:
```bash
cd apps/backend
python run.py --spec 001
```

**With the Electron frontend**:
```bash
npm start        # Build and run desktop app
npm run dev      # Run in development mode
```

- `.auto-claude/specs/` - Per-project data (specs, plans, QA reports) - gitignored
