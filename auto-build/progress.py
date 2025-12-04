"""
Progress Tracking Utilities
===========================

Functions for tracking and displaying progress of the autonomous coding agent.
"""

import json
from pathlib import Path


def count_passing_tests(project_dir: Path) -> tuple[int, int]:
    """
    Count passing and total tests in feature_list.json.

    Args:
        project_dir: Directory containing feature_list.json

    Returns:
        (passing_count, total_count)
    """
    tests_file = project_dir / "feature_list.json"

    if not tests_file.exists():
        return 0, 0

    try:
        with open(tests_file, "r") as f:
            tests = json.load(f)

        total = len(tests)
        passing = sum(1 for test in tests if test.get("passes", False))

        return passing, total
    except (json.JSONDecodeError, IOError):
        return 0, 0


def is_build_complete(project_dir: Path) -> bool:
    """
    Check if all tests are passing.

    Args:
        project_dir: Directory containing feature_list.json

    Returns:
        True if all tests pass, False otherwise
    """
    passing, total = count_passing_tests(project_dir)
    return total > 0 and passing == total


def get_progress_percentage(project_dir: Path) -> float:
    """
    Get the progress as a percentage.

    Args:
        project_dir: Directory containing feature_list.json

    Returns:
        Percentage of tests passing (0-100)
    """
    passing, total = count_passing_tests(project_dir)
    if total == 0:
        return 0.0
    return (passing / total) * 100


def print_session_header(session_num: int, is_initializer: bool) -> None:
    """Print a formatted header for the session."""
    session_type = "INITIALIZER AGENT" if is_initializer else "CODING AGENT"

    print("\n" + "=" * 70)
    print(f"  SESSION {session_num}: {session_type}")
    print("=" * 70)
    print()


def print_progress_summary(project_dir: Path) -> None:
    """Print a summary of current progress."""
    passing, total = count_passing_tests(project_dir)

    if total > 0:
        percentage = (passing / total) * 100
        bar_width = 40
        filled = int(bar_width * passing / total)
        bar = "=" * filled + "-" * (bar_width - filled)

        print(f"\nProgress: [{bar}] {passing}/{total} ({percentage:.1f}%)")

        if passing == total:
            print("Status: BUILD COMPLETE - All tests passing!")
        else:
            remaining = total - passing
            print(f"Status: {remaining} tests remaining")
    else:
        print("\nProgress: feature_list.json not yet created")


def get_test_summary(project_dir: Path) -> dict:
    """
    Get a detailed summary of test status.

    Args:
        project_dir: Directory containing feature_list.json

    Returns:
        Dictionary with test statistics
    """
    tests_file = project_dir / "feature_list.json"

    if not tests_file.exists():
        return {
            "total": 0,
            "passing": 0,
            "failing": 0,
            "by_category": {},
            "by_priority": {},
        }

    try:
        with open(tests_file, "r") as f:
            tests = json.load(f)

        summary = {
            "total": len(tests),
            "passing": 0,
            "failing": 0,
            "by_category": {},
            "by_priority": {},
        }

        for test in tests:
            passes = test.get("passes", False)
            category = test.get("category", "unknown")
            priority = test.get("priority", 0)

            if passes:
                summary["passing"] += 1
            else:
                summary["failing"] += 1

            # By category
            if category not in summary["by_category"]:
                summary["by_category"][category] = {"passing": 0, "failing": 0}
            if passes:
                summary["by_category"][category]["passing"] += 1
            else:
                summary["by_category"][category]["failing"] += 1

            # By priority
            if priority not in summary["by_priority"]:
                summary["by_priority"][priority] = {"passing": 0, "failing": 0}
            if passes:
                summary["by_priority"][priority]["passing"] += 1
            else:
                summary["by_priority"][priority]["failing"] += 1

        return summary

    except (json.JSONDecodeError, IOError):
        return {
            "total": 0,
            "passing": 0,
            "failing": 0,
            "by_category": {},
            "by_priority": {},
        }
