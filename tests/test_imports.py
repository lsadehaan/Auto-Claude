"""
Import Verification Tests
=========================

Ensures all facade modules properly export functions from their core counterparts.
These tests catch missing exports that cause ImportError at runtime.
"""

import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "apps" / "backend"
sys.path.insert(0, str(backend_path))


def test_progress_facade_exports():
    """Verify progress.py facade exports all functions from core.progress"""
    from core.progress import __all__ as core_all
    from progress import __all__ as facade_all

    core_set = set(core_all)
    facade_set = set(facade_all)

    missing = core_set - facade_set
    extra = facade_set - core_set

    assert not missing, f"Missing exports in progress.py: {missing}"
    # Extra exports are OK (facade can add its own), but warn
    if extra:
        print(f"⚠️  progress.py has extra exports not in core: {extra}")


def test_progress_imports_work():
    """Verify all progress exports can actually be imported"""
    from progress import (
        count_subtasks,
        count_subtasks_detailed,
        format_duration,
        get_current_phase,
        get_next_subtask,
        get_plan_summary,
        get_progress_percentage,
        is_build_complete,
        print_build_complete_banner,
        print_paused_banner,
        print_progress_summary,
        print_session_header,
        sync_progress_from_reality,
    )

    # Just importing is enough - if any are missing, this will fail
    assert callable(sync_progress_from_reality)
    assert callable(count_subtasks)


def test_reviewer_imports_work():
    """Verify reviewer agent imports work"""
    from agents.reviewer import review_subtask, review_task, is_review_enabled

    assert callable(review_subtask)
    assert callable(review_task)
    assert callable(is_review_enabled)


def test_phase_config_imports_work():
    """Verify phase_config feature functions work"""
    from phase_config import (
        get_feature_model,
        get_feature_thinking,
        get_feature_thinking_budget,
        get_feature_config,
    )

    assert callable(get_feature_model)
    assert callable(get_feature_thinking)
    assert callable(get_feature_thinking_budget)
    assert callable(get_feature_config)


def test_critical_client_imports():
    """Verify client.py and core modules can be imported"""
    from client import create_client
    from core.auth import get_auth_token
    from security import validate_bash_command

    assert callable(create_client)
    assert callable(get_auth_token)
    assert callable(validate_bash_command)


def test_agent_modules_importable():
    """Verify all agent modules can be imported without errors"""
    # These imports will fail if there are circular dependencies or missing imports
    from agents.coder import run_coder
    from agents.session import run_session
    from agents.planner import run_planner

    assert callable(run_coder)
    assert callable(run_session)
    assert callable(run_planner)


if __name__ == "__main__":
    # Allow running tests directly
    import pytest

    pytest.main([__file__, "-v"])
