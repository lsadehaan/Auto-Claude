"""
Reviewer Agent Module
=====================

Runs automated review of subtasks and tasks using Claude Agent SDK.
Provides two levels of review:
1. Subtask review - Quick validation after each subtask session
2. Task review - Comprehensive validation after all subtasks complete
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Check for Claude SDK availability
try:
    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False
    ClaudeAgentOptions = None
    ClaudeSDKClient = None

from core.auth import ensure_claude_code_oauth_token, get_auth_token

# Default model for reviews (fast and accurate)
DEFAULT_REVIEW_MODEL = "claude-3-5-haiku-latest"

# Maximum diff size to send to the LLM
MAX_DIFF_CHARS = 20000


def is_review_enabled() -> bool:
    """Check if automated review is enabled."""
    if not SDK_AVAILABLE:
        return False
    if not get_auth_token():
        return False
    enabled_str = os.environ.get("AUTO_REVIEW_ENABLED", "true").lower()
    return enabled_str in ("true", "1", "yes")


def get_review_model() -> str:
    """Get the model to use for automated review."""
    return os.environ.get("REVIEWER_MODEL", DEFAULT_REVIEW_MODEL)


# =============================================================================
# Git Helpers
# =============================================================================


def get_git_diff(
    project_dir: Path,
    commit_before: str | None,
    commit_after: str | None,
) -> str:
    """Get the git diff between two commits."""
    if not commit_before or not commit_after:
        return "(No commits to diff)"

    if commit_before == commit_after:
        return "(No changes - same commit)"

    try:
        result = subprocess.run(
            ["git", "diff", commit_before, commit_after],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )
        diff = result.stdout

        if len(diff) > MAX_DIFF_CHARS:
            diff = diff[:MAX_DIFF_CHARS] + f"\n\n... (truncated, {len(diff)} chars total)"

        return diff if diff else "(Empty diff)"

    except Exception as e:
        logger.warning(f"Failed to get git diff: {e}")
        return f"(Failed to get diff: {e})"


def get_changed_files(
    project_dir: Path,
    commit_before: str | None,
    commit_after: str | None,
) -> list[str]:
    """Get list of files changed between two commits."""
    if not commit_before or not commit_after or commit_before == commit_after:
        return []

    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", commit_before, commit_after],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
        return files
    except Exception as e:
        logger.warning(f"Failed to get changed files: {e}")
        return []


def get_commit_count(
    project_dir: Path,
    commit_before: str | None,
    commit_after: str | None,
) -> int:
    """Get number of commits between two refs."""
    if not commit_before or not commit_after:
        return 0

    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", f"{commit_before}..{commit_after}"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return int(result.stdout.strip())
    except Exception:
        return 0


# =============================================================================
# Subtask Review
# =============================================================================


def _build_subtask_review_prompt(
    subtask_id: str,
    subtask_description: str,
    diff: str,
    changed_files: list[str],
    commit_count: int,
) -> str:
    """Build prompt for subtask review."""
    prompt_file = Path(__file__).parent.parent / "prompts" / "subtask_reviewer.md"

    if prompt_file.exists():
        base_prompt = prompt_file.read_text()
    else:
        base_prompt = """You are reviewing a subtask. Check if work was done.
Output ONLY valid JSON with: verdict, confidence, summary, work_done, commits_found, concerns, recommendation"""

    context = f"""
---

## SUBTASK TO REVIEW

**Subtask ID**: {subtask_id}
**Description**: {subtask_description}

## WORK DONE

**Commits Made**: {commit_count}
**Files Changed**: {len(changed_files)}

### Changed Files
{chr(10).join(f"- {f}" for f in changed_files) if changed_files else "(No files changed)"}

### Git Diff
```diff
{diff}
```

---

Review this subtask and output ONLY the JSON verdict.
"""

    return base_prompt + context


async def review_subtask(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    subtask_description: str,
    commit_before: str | None,
    commit_after: str | None,
) -> dict | None:
    """
    Review a single subtask after session completion.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        subtask_id: ID of the subtask being reviewed
        subtask_description: Description of what the subtask should do
        commit_before: Commit hash before session
        commit_after: Commit hash after session

    Returns:
        Review verdict dict or None if review failed
    """
    if not is_review_enabled():
        logger.debug("Auto-review disabled, skipping subtask review")
        return None

    # Gather review inputs
    diff = get_git_diff(project_dir, commit_before, commit_after)
    changed_files = get_changed_files(project_dir, commit_before, commit_after)
    commit_count = get_commit_count(project_dir, commit_before, commit_after)

    prompt = _build_subtask_review_prompt(
        subtask_id, subtask_description, diff, changed_files, commit_count
    )

    return await _run_review(prompt, project_dir)


# =============================================================================
# Task Review
# =============================================================================


def _load_spec(spec_dir: Path) -> str:
    """Load the spec.md file."""
    spec_file = spec_dir / "spec.md"
    if spec_file.exists():
        return spec_file.read_text()
    return "(No spec.md found)"


def _load_implementation_plan(spec_dir: Path) -> dict:
    """Load implementation_plan.json."""
    plan_file = spec_dir / "implementation_plan.json"
    if plan_file.exists():
        try:
            with open(plan_file) as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass
    return {}


def _get_all_commits_for_task(project_dir: Path, spec_dir: Path) -> str:
    """Get all commits for this task (from branch)."""
    spec_id = spec_dir.name
    branch_name = f"auto-claude/{spec_id}"

    try:
        # Get commit log for the branch
        result = subprocess.run(
            ["git", "log", branch_name, "--oneline", "--no-merges", "-20"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout if result.returncode == 0 else "(No commits found)"
    except Exception as e:
        return f"(Failed to get commits: {e})"


def _build_task_review_prompt(
    spec: str,
    plan: dict,
    commits: str,
    spec_dir: Path,
) -> str:
    """Build prompt for task-level review."""
    prompt_file = Path(__file__).parent.parent / "prompts" / "task_reviewer.md"

    if prompt_file.exists():
        base_prompt = prompt_file.read_text()
    else:
        base_prompt = """You are reviewing a complete task. Check if all requirements are met.
Output ONLY valid JSON with: verdict, confidence, summary, details, recommendation"""

    # Count subtasks
    completed = 0
    total = 0
    for phase in plan.get("phases", []):
        for subtask in phase.get("subtasks", []):
            total += 1
            if subtask.get("status") == "completed":
                completed += 1

    context = f"""
---

## TASK SPECIFICATION

{spec}

## IMPLEMENTATION PLAN

**Total Subtasks**: {total}
**Completed**: {completed}
**Status**: {plan.get('status', 'unknown')}

### Subtasks Summary
"""

    # Add subtasks
    for phase in plan.get("phases", []):
        phase_name = phase.get("name", "Unknown Phase")
        context += f"\n**Phase: {phase_name}**\n"
        for subtask in phase.get("subtasks", []):
            sid = subtask.get("id", "unknown")
            desc = subtask.get("description", "")
            status = subtask.get("status", "pending")
            context += f"- [{status}] {sid}: {desc}\n"

    context += f"""
## GIT COMMITS

```
{commits}
```

---

Review this completed task and output ONLY the JSON verdict.
"""

    return base_prompt + context


async def review_task(
    spec_dir: Path,
    project_dir: Path,
) -> dict | None:
    """
    Review a complete task after all subtasks finish.

    Args:
        spec_dir: Spec directory containing spec.md and implementation_plan.json
        project_dir: Project root directory

    Returns:
        Review verdict dict or None if review failed
    """
    if not is_review_enabled():
        logger.debug("Auto-review disabled, skipping task review")
        return None

    # Gather review inputs
    spec = _load_spec(spec_dir)
    plan = _load_implementation_plan(spec_dir)
    commits = _get_all_commits_for_task(project_dir, spec_dir)

    prompt = _build_task_review_prompt(spec, plan, commits, spec_dir)

    return await _run_review(prompt, project_dir)


# =============================================================================
# Common Review Runner
# =============================================================================


async def _run_review(prompt: str, project_dir: Path) -> dict | None:
    """
    Run review using Claude Agent SDK.

    Args:
        prompt: The review prompt
        project_dir: Project directory for SDK context

    Returns:
        Review verdict dict or None if failed
    """
    if not SDK_AVAILABLE:
        logger.warning("Claude SDK not available, skipping review")
        return None

    if not get_auth_token():
        logger.warning("No authentication token found, skipping review")
        return None

    # Ensure SDK can find the token
    ensure_claude_code_oauth_token()

    model = get_review_model()
    cwd = str(project_dir.resolve())

    try:
        # Create SDK client for review
        client = ClaudeSDKClient(
            options=ClaudeAgentOptions(
                model=model,
                system_prompt=(
                    "You are an expert code reviewer. You verify that work was completed correctly. "
                    "Always respond with valid JSON only, no markdown formatting or explanations."
                ),
                allowed_tools=[],  # No tools needed for review
                max_turns=1,  # Single turn review
                cwd=cwd,
            )
        )

        # Use async context manager
        async with client:
            await client.query(prompt)

            # Collect the response
            response_text = ""
            async for msg in client.receive_response():
                msg_type = type(msg).__name__
                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        if hasattr(block, "text"):
                            response_text += block.text

        # Parse JSON from response
        return _parse_verdict(response_text)

    except Exception as e:
        logger.warning(f"Review failed: {e}")
        return None


def _parse_verdict(response_text: str) -> dict | None:
    """Parse the review verdict JSON from LLM response."""
    text = response_text.strip()

    # Handle markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        verdict = json.loads(text)

        if not isinstance(verdict, dict):
            logger.warning("Review verdict is not a dict")
            return None

        # Validate required fields
        required = ["verdict", "confidence", "summary"]
        if not all(k in verdict for k in required):
            logger.warning(f"Review verdict missing required fields: {required}")
            return None

        return verdict

    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse review verdict JSON: {e}")
        logger.debug(f"Response text: {text[:500]}")
        return None
