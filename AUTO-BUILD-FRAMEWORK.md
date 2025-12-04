# Auto-Build Framework

A production-ready framework for autonomous multi-session AI coding agents. Based on Anthropic's autonomous coding demo, adapted for real-world applications.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Framework Components](#framework-components)
5. [The Three Agents](#the-three-agents)
6. [File Structure](#file-structure)
7. [Configuration](#configuration)
8. [Dynamic Test Generation](#dynamic-test-generation)
9. [Security Model](#security-model)
10. [GitHub Integration](#github-integration)
11. [Usage Patterns](#usage-patterns)
12. [Troubleshooting](#troubleshooting)

---

## Overview

Auto-Build is a **multi-session autonomous coding framework** that builds features or entire applications through coordinated AI agent sessions. Each session operates with a fresh context window, communicating progress through files and Git commits.

### Key Principles

- **Domain Agnostic**: Works for web apps, APIs, CLIs, mobile backends, or any software project
- **Multi-Session Orchestration**: Unlimited sessions, each picking up where the last left off
- **File-Based State**: All progress tracked via `feature_list.json` and Git
- **Self-Verifying**: Agents test their own work before marking features complete
- **Defense-in-Depth Security**: Multiple layers protecting the host system
- **Runs Until Complete**: Continues autonomously until all tests pass

### What It Builds

| Use Case | Example |
|----------|---------|
| **New Application** | "Build a task management app with React frontend and Express API" |
| **New Feature** | "Add user authentication with OAuth to existing app" |
| **Major Refactor** | "Migrate from REST to GraphQL across the entire API" |
| **Complex Integration** | "Integrate Stripe payments with subscription management" |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTO-BUILD FLOW                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SPEC AGENT  │────▶│  INITIALIZER │────▶│ CODING AGENT │
│  (One-time)  │     │  (Session 1) │     │ (Sessions 2+)│
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
   spec.md           feature_list.json      Implementation
   (PRD)             (Test Registry)         + Tests
                           │                    │
                           └────────────────────┘
                                    │
                                    ▼
                           ┌──────────────┐
                           │  Git Branch  │
                           │ auto-build/* │
                           └──────────────┘
```

### Session Flow

```
Session N
  ├─▶ Read: feature_list.json, spec.md, build-progress.txt
  ├─▶ Execute: Implement feature + test with browser/API
  ├─▶ Modify: Mark test(s) as passing in feature_list.json
  ├─▶ Execute: git commit -m "Implement [feature]"
  └─▶ Exit cleanly

         ↓ (3 second delay)

Session N+1
  └─▶ Fresh context, reads files, continues from where N left off
```

### Communication Between Sessions

Sessions have **no memory** of each other. All communication happens through:

| File | Purpose |
|------|---------|
| `spec.md` | The PRD - what to build (immutable after creation) |
| `feature_list.json` | Test registry - source of truth for progress |
| `build-progress.txt` | Human-readable session notes |
| Git history | Code changes and commit messages |

---

## Quick Start

### Prerequisites

- Python 3.8+
- Claude Code CLI (latest version)
- Node.js 18+ (for Puppeteer browser testing)
- `CLAUDE_CODE_OAUTH_TOKEN` environment variable set (run `claude setup-token`)

### Installation

**Step 1: Copy the auto-build folder to your project**

```bash
# Copy the entire auto-build/ folder and .claude/commands/ to your project
cp -r path/to/auto-build ./
cp -r path/to/.claude ./
```

**Step 2: Set up the Python environment**

The `/spec` command will automatically set this up, but you can also do it manually:

```bash
# Option A: Using uv (recommended - faster)
cd auto-build && uv venv && uv pip install -r requirements.txt && cd ..

# Option B: Using standard venv
cd auto-build
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

**Step 3: Set up Claude Code OAuth token**

```bash
# Get your OAuth token (one-time setup)
claude setup-token

# Then set the environment variable
export CLAUDE_CODE_OAUTH_TOKEN='your-token-here'
```

### Running Auto-Build

```bash
# 1. First, create your spec (interactive)
# This will also set up the environment if needed
claude /spec

# 2. Activate the virtual environment
source auto-build/.venv/bin/activate

# 3. List available specs
python auto-build/run.py --list

# 4. Run a specific spec
python auto-build/run.py --spec 001
python auto-build/run.py --spec 001-initial-app

# Or with options
python auto-build/run.py --spec 001 --max-iterations 10  # Limit sessions
python auto-build/run.py --spec 001 --model claude-opus-4-5-20251101
```

### Managing Multiple Specs

Each spec lives in its own folder under `auto-build/specs/`:

```
auto-build/specs/
├── 001-initial-app/        # First spec (e.g., create the app)
│   ├── spec.md
│   ├── feature_list.json
│   └── progress.txt
├── 002-user-auth/          # Second spec (add authentication)
│   ├── spec.md
│   ├── feature_list.json
│   └── progress.txt
└── 003-payment-integration/ # Third spec (add payments)
    └── spec.md              # Not yet started
```

### Stopping and Resuming

```bash
# Pause anytime with Ctrl+C (progress is saved via Git)

# Resume by running the same command again
python auto-build/run.py --spec 001

# The agent will read feature_list.json and continue from where it left off
```

---

## Framework Components

### Directory Structure

```
your-project/
├── .claude/
│   └── commands/
│       └── spec.md              # Interactive spec creation command
├── auto-build/
│   ├── run.py                   # Entry point
│   ├── agent.py                 # Session orchestration
│   ├── client.py                # Claude SDK configuration
│   ├── security.py              # Command validation & hooks
│   ├── progress.py              # Progress tracking utilities
│   ├── prompts.py               # Prompt loading utilities
│   ├── prompts/
│   │   ├── initializer.md       # Session 1 agent prompt
│   │   └── coder.md             # Sessions 2+ agent prompt
│   └── specs/                   # All specs stored here
│       ├── 001-initial-app/
│       │   ├── spec.md          # The specification
│       │   ├── feature_list.json # Test registry for this spec
│       │   └── progress.txt     # Progress notes for this spec
│       └── 002-user-auth/
│           ├── spec.md
│           ├── feature_list.json
│           └── progress.txt
├── init.sh                      # Environment setup script (in project root)
└── [your project files]         # Code is implemented in project root
```

### Core Files

| File | Description |
|------|-------------|
| `run.py` | CLI entry point, argument parsing, main loop invocation |
| `agent.py` | Orchestrates sessions, handles fresh context per iteration |
| `client.py` | Creates Claude SDK client with security settings, MCP servers |
| `security.py` | Command allowlist, pre-execution hooks, validation logic |
| `progress.py` | Utilities for counting tests, generating progress summaries |

---

## The Three Agents

### 1. Spec Agent (`/spec` command)

**Purpose**: Interactive PRD creation through questionnaire

**Location**: `.claude/commands/spec.md`

**Invocation**: `claude /spec`

**Behavior**:
- For **new projects**: Asks about goals, tech stack, features, constraints
- For **existing projects**: First scans codebase to understand patterns, then asks about the new feature
- Outputs a structured `spec.md` file

**Key Questions Asked**:
1. Is this a new project or adding to an existing one?
2. (If existing) What feature are you building?
3. What is the core purpose/goal?
4. What tech stack? (or auto-detect from existing project)
5. What are the must-have features?
6. What are the nice-to-have features?
7. Any constraints or requirements?
8. What does success look like?

### 2. Initializer Agent (Session 1)

**Purpose**: Create the test registry and project foundation

**Prompt**: `auto-build/prompts/initializer.md`

**Responsibilities**:
1. Read `spec.md` thoroughly
2. (For existing projects) Deep scan of codebase to understand:
   - File structure and organization patterns
   - Existing components, utilities, helpers
   - API routes and data models
   - Styling approach (CSS modules, Tailwind, etc.)
   - Testing patterns already in use
3. Generate `feature_list.json` with dynamic test count
4. Create `init.sh` environment setup script
5. Create branch `auto-build/[feature-name]`
6. Initial commit with foundation files
7. Optionally begin implementation

**Output Files**:
- `feature_list.json` - Test registry (source of truth)
- `init.sh` - Environment setup script
- `build-progress.txt` - Initial progress notes

### 3. Coding Agent (Sessions 2+)

**Purpose**: Implement features one-by-one until all tests pass

**Prompt**: `auto-build/prompts/coder.md`

**Per-Session Workflow**:
1. **Orient**: Read spec, feature_list, progress notes, git log
2. **Verify**: Run 1-2 existing passing tests to check for regressions
3. **Select**: Find highest-priority failing test
4. **Implement**: Write code for that feature
5. **Test**: Verify with browser automation (Puppeteer) or API calls
6. **Mark**: Change `"passes": false` to `"passes": true`
7. **Commit**: Descriptive commit message
8. **Document**: Update build-progress.txt
9. **Clean Exit**: Leave codebase in working state

**Termination Condition**: All tests in `feature_list.json` have `"passes": true`

---

## File Structure

### spec.md (PRD)

Created by the `/spec` command. Example structure:

```markdown
# Project Specification

## Overview
[What this project/feature does]

## Tech Stack
- Frontend: React with Vite
- Backend: Express.js
- Database: PostgreSQL
- Styling: Tailwind CSS

## Features

### Core Features (Must Have)
1. User authentication with email/password
2. Dashboard with usage statistics
3. ...

### Secondary Features (Nice to Have)
1. OAuth integration
2. ...

## Constraints
- Must work on mobile
- Must support dark mode
- API response time < 200ms

## Success Criteria
- All features functional
- UI matches design specifications
- No console errors
- Passes accessibility audit
```

### feature_list.json (Test Registry)

Generated by the Initializer Agent:

```json
[
  {
    "category": "functional",
    "priority": 1,
    "description": "User can log in with email and password",
    "steps": [
      "Navigate to /login",
      "Enter valid email in email field",
      "Enter valid password in password field",
      "Click login button",
      "Verify redirect to dashboard",
      "Verify user name displayed in header"
    ],
    "passes": false
  },
  {
    "category": "functional",
    "priority": 1,
    "description": "Invalid login shows error message",
    "steps": [
      "Navigate to /login",
      "Enter invalid credentials",
      "Click login button",
      "Verify error message displayed",
      "Verify still on login page"
    ],
    "passes": false
  },
  {
    "category": "style",
    "priority": 2,
    "description": "Login page matches design specification",
    "steps": [
      "Navigate to /login",
      "Take screenshot",
      "Verify centered card layout",
      "Verify brand colors applied",
      "Verify responsive on mobile viewport"
    ],
    "passes": false
  }
]
```

**Fields**:
- `category`: "functional" | "style" | "integration" | "edge-case"
- `priority`: 1 (highest) to 5 (lowest) - agents work on priority 1 first
- `description`: What this test verifies
- `steps`: Concrete verification steps
- `passes`: false → true (ONLY field that changes)

**Rules**:
- Tests are NEVER removed or edited (except `passes` field)
- Priority determines implementation order
- Each test should be independently verifiable

### build-progress.txt

Human-readable progress notes:

```
=== AUTO-BUILD PROGRESS ===

Session 1 (2024-01-15 10:30):
- Created feature_list.json with 45 tests
- Set up project structure
- Created init.sh for environment setup
- Tests passing: 0/45

Session 2 (2024-01-15 10:45):
- Implemented user registration API
- Created registration form UI
- Tests passing: 3/45
- Next: Login functionality

Session 3 (2024-01-15 11:00):
- Implemented login API and UI
- Fixed password validation bug
- Tests passing: 7/45
- Next: Dashboard layout
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | Your Claude Code OAuth token (run `claude setup-token`) |
| `AUTO_BUILD_MODEL` | No | Model override (default: claude-opus-4-5-20251101) |

### CLI Arguments

```bash
python auto-build/run.py [OPTIONS]

Options:
  --max-iterations N    Limit number of sessions (default: unlimited)
  --model MODEL         Claude model to use
  --project-dir PATH    Project directory (default: current directory)
  --verbose            Enable detailed logging
```

### .claude_settings.json

Auto-created in project directory with security settings:

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true
  },
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Read(./**)",
      "Write(./**)",
      "Edit(./**)",
      "Glob(./**)",
      "Grep(./**)",
      "Bash(*)",
      "mcp__puppeteer__*"
    ]
  }
}
```

---

## Dynamic Test Generation

Unlike the fixed 200-test demo, Auto-Build generates tests dynamically based on project scope.

### Test Count Formula

```
total_tests = base_tests + Σ(feature_tests)

Where:
  base_tests = 5-10 (project setup, core smoke tests)
  feature_tests = complexity_score × test_depth

Complexity Score (per feature):
  - Simple (toggle, single field): 2-3 tests
  - Medium (form, CRUD operation): 5-8 tests
  - Complex (multi-step workflow): 10-15 tests
  - Integration (external API, auth): 8-12 tests
```

### Examples by Project Size

| Project Type | Features | Estimated Tests |
|--------------|----------|-----------------|
| Single feature addition | 1 | 15-40 tests |
| Small app (MVP) | 5-10 | 50-100 tests |
| Medium app | 15-25 | 100-200 tests |
| Large app | 30+ | 200-400 tests |

### Test Categories

| Category | Description | Example |
|----------|-------------|---------|
| `functional` | Core feature works correctly | "User can submit form" |
| `style` | Visual/UI requirements | "Button has hover state" |
| `integration` | External systems work | "Payment processes successfully" |
| `edge-case` | Error handling, limits | "Form shows error for invalid email" |
| `accessibility` | A11y requirements | "Form is keyboard navigable" |

---

## Security Model

Auto-Build implements **defense-in-depth** with multiple security layers:

### Layer 1: OS-Level Sandbox

```python
# Enabled via .claude_settings.json
"sandbox": {
  "enabled": true,
  "autoAllowBashIfSandboxed": true
}
```

Bash commands run in an isolated sandbox, preventing system-wide modifications.

### Layer 2: Filesystem Restrictions

```python
# Only project directory accessible
"permissions": {
  "allow": [
    "Read(./**)",
    "Write(./**)",
    # ...
  ]
}
```

### Layer 3: Command Allowlist

Only these commands are permitted:

```python
ALLOWED_COMMANDS = {
    # File inspection
    "ls", "cat", "head", "tail", "wc", "grep",
    # File operations
    "cp", "mkdir", "chmod",
    # Directory
    "pwd",
    # Node.js ecosystem
    "npm", "npx", "node", "pnpm", "yarn", "bun",
    # Version control
    "git",
    # Process management
    "ps", "lsof", "sleep", "pkill",
    # Project scripts
    "init.sh",
    # Python (if needed)
    "python", "python3", "pip",
}
```

### Layer 4: Pre-Execution Hooks

Commands are validated before execution:

```python
async def bash_security_hook(input_data, tool_use_id=None, context=None):
    command = input_data.get("tool_input", {}).get("command", "")
    commands = extract_commands(command)

    for cmd in commands:
        if cmd not in ALLOWED_COMMANDS:
            return {
                "decision": "block",
                "reason": f"Command '{cmd}' not in allowlist"
            }

    return {}  # Allow execution
```

### Special Validations

| Command | Restriction |
|---------|-------------|
| `chmod` | Only `+x` (executable) allowed |
| `pkill` | Only dev processes (node, npm, vite, etc.) |
| `init.sh` | Only `./init.sh` path allowed |

---

## GitHub Integration

### Branch Strategy

All auto-build work happens on a dedicated branch:

```
main (or master)
  └── auto-build/user-authentication    # Feature branch
        ├── commit: "Initial setup: feature_list.json"
        ├── commit: "Implement login API endpoint"
        ├── commit: "Add login form UI"
        ├── commit: "Implement session management"
        └── commit: "Complete: All 23 tests passing"
```

### Branch Naming

```
auto-build/[feature-name-kebab-case]

Examples:
  auto-build/user-authentication
  auto-build/payment-integration
  auto-build/dashboard-redesign
  auto-build/full-app  # For new applications
```

### Commit Pattern

Each coding session creates commits:

```bash
git commit -m "Implement [feature name] - verified end-to-end

- Added [specific changes]
- Tested with browser automation
- Updated feature_list.json: marked test #X as passing
- Progress: 12/45 tests passing"
```

### After Completion

When all tests pass, the branch is ready for:
1. Human review of the code
2. Manual testing verification
3. PR creation and merge to main

---

## Usage Patterns

### Pattern 1: New Application from Scratch

```bash
# 1. Create empty project directory
mkdir my-new-app && cd my-new-app

# 2. Install auto-build framework
curl -sSL [install-script] | bash

# 3. Create specification interactively
claude /spec
# Answer questions about your app...

# 4. Run autonomous build
python auto-build/run.py
# Wait until all tests pass...

# 5. Review and deploy
git log --oneline
# Manual testing, then merge
```

### Pattern 2: Add Feature to Existing Project

```bash
# 1. From existing project root
cd existing-project

# 2. Install auto-build (if not already)
curl -sSL [install-script] | bash

# 3. Create feature specification
claude /spec
# Select "existing project"
# Describe the new feature...

# 4. Run autonomous build
python auto-build/run.py
# Agents will understand existing codebase
# And implement feature following existing patterns

# 5. Review changes on auto-build/* branch
git diff main...auto-build/new-feature
```

### Pattern 3: Limited Test Run

```bash
# Run only 5 sessions to test the framework
python auto-build/run.py --max-iterations 5

# Check progress
cat build-progress.txt
cat feature_list.json | grep '"passes": true' | wc -l
```

### Pattern 4: Resume After Interruption

```bash
# If stopped (Ctrl+C or system restart)
# Just run again - it picks up from feature_list.json
python auto-build/run.py
```

---

## Troubleshooting

### Common Issues

**Agent stuck on failing test**
```bash
# Check build-progress.txt for context
cat build-progress.txt | tail -50

# The agent may need manual intervention
# Edit the test or provide guidance in spec.md
```

**Browser automation failing**
```bash
# Ensure Puppeteer is installed
npm install -g puppeteer

# Check if dev server is running
curl http://localhost:3000

# Review init.sh for startup issues
cat init.sh
```

**Context window filling up**
- Sessions auto-terminate before context fills
- Progress is saved via Git
- Next session starts fresh

**Regressions detected**
- Agent marks broken tests as `"passes": false`
- Fixes regressions before continuing
- This is expected behavior

### Logs and Debugging

```bash
# Enable verbose output
python auto-build/run.py --verbose

# Check recent Git history
git log --oneline -20

# View all test statuses
cat feature_list.json | jq '.[] | {description, passes}'

# Count progress
echo "Passing: $(grep -c '"passes": true' feature_list.json)"
echo "Failing: $(grep -c '"passes": false' feature_list.json)"
```

### Manual Intervention

If an agent is stuck:

1. **Check the test**: Maybe it's poorly defined
2. **Update spec.md**: Add clarification (agents re-read it each session)
3. **Edit feature_list.json**: Simplify test steps (but don't remove tests)
4. **Provide hints in build-progress.txt**: Agents read this file

---

## Best Practices

### Writing Good Specs

1. **Be specific**: "Add login with email/password" > "Add authentication"
2. **Define success criteria**: What does "done" look like?
3. **List constraints**: Mobile support? Performance requirements?
4. **Prioritize features**: Must-have vs nice-to-have

### For Existing Projects

1. **Start small**: One feature at a time
2. **Document patterns**: If your project has conventions, mention them in spec
3. **Test existing functionality**: Ensure init.sh works

### Monitoring Progress

1. **Watch build-progress.txt**: Human-readable status
2. **Check Git commits**: Each feature = commit
3. **Count passing tests**: Quick progress indicator

---

## Appendix: Full File Templates

See the following files for complete implementations:

- `.claude/commands/spec.md` - Spec agent command
- `auto-build/prompts/initializer.md` - Initializer agent prompt
- `auto-build/prompts/coder.md` - Coding agent prompt
- `auto-build/run.py` - Entry point
- `auto-build/agent.py` - Session orchestration
- `auto-build/client.py` - SDK configuration
- `auto-build/security.py` - Security hooks

---

## License

MIT License - Use freely in your projects.

---

*Auto-Build Framework v1.0*
*Based on Anthropic's Autonomous Coding Demo*
