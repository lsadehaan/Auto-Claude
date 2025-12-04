#!/usr/bin/env python3
"""
Auto-Build Framework
====================

A multi-session autonomous coding framework for building features and applications.

Usage:
    python auto-build/run.py --spec 001-initial-app
    python auto-build/run.py --spec 001
    python auto-build/run.py --list
    python auto-build/run.py --spec 002 --max-iterations 5

Prerequisites:
    - CLAUDE_CODE_OAUTH_TOKEN environment variable set (run: claude setup-token)
    - Spec created via: claude /spec
    - Claude Code CLI installed
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Add auto-build directory to path for imports
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

# Load .env file from auto-build directory
from dotenv import load_dotenv
env_file = SCRIPT_DIR / ".env"
if env_file.exists():
    load_dotenv(env_file)

from agent import run_autonomous_agent
from progress import count_passing_tests


# Configuration
DEFAULT_MODEL = "claude-opus-4-5-20251101"
SPECS_DIR = "auto-build/specs"


def get_specs_dir(project_dir: Path) -> Path:
    """Get the specs directory path."""
    return project_dir / SPECS_DIR


def list_specs(project_dir: Path) -> list[dict]:
    """
    List all specs in the project.

    Returns:
        List of spec info dicts with keys: number, name, path, status, progress
    """
    specs_dir = get_specs_dir(project_dir)
    specs = []

    if not specs_dir.exists():
        return specs

    for spec_folder in sorted(specs_dir.iterdir()):
        if not spec_folder.is_dir():
            continue

        # Parse folder name (e.g., "001-initial-app")
        folder_name = spec_folder.name
        parts = folder_name.split("-", 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue

        number = parts[0]
        name = parts[1]

        # Check for spec.md
        spec_file = spec_folder / "spec.md"
        if not spec_file.exists():
            continue

        # Check progress
        feature_list = spec_folder / "feature_list.json"
        if feature_list.exists():
            passing, total = count_passing_tests(spec_folder)
            if total > 0:
                if passing == total:
                    status = "complete"
                else:
                    status = "in_progress"
                progress = f"{passing}/{total}"
            else:
                status = "initialized"
                progress = "0/0"
        else:
            status = "pending"
            progress = "-"

        specs.append({
            "number": number,
            "name": name,
            "folder": folder_name,
            "path": spec_folder,
            "status": status,
            "progress": progress,
        })

    return specs


def find_spec(project_dir: Path, spec_identifier: str) -> Path | None:
    """
    Find a spec by number or full name.

    Args:
        project_dir: Project root directory
        spec_identifier: Either "001" or "001-feature-name"

    Returns:
        Path to spec folder, or None if not found
    """
    specs_dir = get_specs_dir(project_dir)

    if not specs_dir.exists():
        return None

    # Try exact match first
    exact_path = specs_dir / spec_identifier
    if exact_path.exists() and (exact_path / "spec.md").exists():
        return exact_path

    # Try matching by number prefix
    for spec_folder in specs_dir.iterdir():
        if spec_folder.is_dir() and spec_folder.name.startswith(spec_identifier + "-"):
            if (spec_folder / "spec.md").exists():
                return spec_folder

    return None


def print_specs_list(project_dir: Path) -> None:
    """Print a formatted list of all specs."""
    specs = list_specs(project_dir)

    if not specs:
        print("\nNo specs found.")
        print("\nCreate your first spec:")
        print("  claude /spec")
        return

    print("\n" + "=" * 70)
    print("  AVAILABLE SPECS")
    print("=" * 70)
    print()

    # Status symbols
    status_symbols = {
        "complete": "[OK]",
        "in_progress": "[..]",
        "initialized": "[--]",
        "pending": "[  ]",
    }

    for spec in specs:
        symbol = status_symbols.get(spec["status"], "[??]")
        print(f"  {symbol} {spec['folder']}")
        print(f"       Status: {spec['status']} | Progress: {spec['progress']}")
        print()

    print("-" * 70)
    print("\nTo run a spec:")
    print("  python auto-build/run.py --spec 001")
    print("  python auto-build/run.py --spec 001-feature-name")
    print()


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Auto-Build Framework - Autonomous multi-session coding agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all specs
  python auto-build/run.py --list

  # Run a specific spec (by number or full name)
  python auto-build/run.py --spec 001
  python auto-build/run.py --spec 001-initial-app

  # Limit iterations for testing
  python auto-build/run.py --spec 001 --max-iterations 5

  # Use a specific model
  python auto-build/run.py --spec 001 --model claude-opus-4-5-20251101

Prerequisites:
  1. Create a spec first: claude /spec
  2. Run 'claude setup-token' and set CLAUDE_CODE_OAUTH_TOKEN

Environment Variables:
  CLAUDE_CODE_OAUTH_TOKEN  Your Claude Code OAuth token (required)
                           Get it by running: claude setup-token
  AUTO_BUILD_MODEL         Override default model (optional)
        """,
    )

    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available specs and their status",
    )

    parser.add_argument(
        "--spec",
        type=str,
        default=None,
        help="Spec to run (e.g., '001' or '001-feature-name')",
    )

    parser.add_argument(
        "--project-dir",
        type=Path,
        default=None,
        help="Project directory (default: current working directory)",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Maximum number of agent sessions (default: unlimited - runs until all tests pass)",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=os.environ.get("AUTO_BUILD_MODEL", DEFAULT_MODEL),
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output",
    )

    return parser.parse_args()


def validate_environment(spec_dir: Path) -> bool:
    """
    Validate that the environment is set up correctly.

    Returns:
        True if valid, False otherwise (with error messages printed)
    """
    valid = True

    # Check for Claude Code OAuth token
    if not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        print("Error: CLAUDE_CODE_OAUTH_TOKEN environment variable not set")
        print("\nGet your OAuth token by running:")
        print("  claude setup-token")
        print("\nThen set it:")
        print("  export CLAUDE_CODE_OAUTH_TOKEN='your-token-here'")
        valid = False

    # Check for spec.md in spec directory
    spec_file = spec_dir / "spec.md"
    if not spec_file.exists():
        print(f"\nError: spec.md not found in {spec_dir}")
        valid = False

    return valid


def print_banner() -> None:
    """Print the Auto-Build banner."""
    print("\n" + "=" * 70)
    print("  AUTO-BUILD FRAMEWORK")
    print("  Autonomous Multi-Session Coding Agent")
    print("=" * 70)


def main() -> None:
    """Main entry point."""
    args = parse_args()

    # Determine project directory
    if args.project_dir:
        project_dir = args.project_dir.resolve()
    else:
        project_dir = Path.cwd()

    # Handle --list
    if args.list:
        print_banner()
        print_specs_list(project_dir)
        return

    # Require --spec if not listing
    if not args.spec:
        print_banner()
        print("\nError: --spec is required")
        print("\nUsage:")
        print("  python auto-build/run.py --list           # See all specs")
        print("  python auto-build/run.py --spec 001       # Run a spec")
        print("\nCreate a new spec with:")
        print("  claude /spec")
        sys.exit(1)

    # Find the spec
    spec_dir = find_spec(project_dir, args.spec)
    if not spec_dir:
        print_banner()
        print(f"\nError: Spec '{args.spec}' not found")
        print("\nAvailable specs:")
        print_specs_list(project_dir)
        sys.exit(1)

    print_banner()
    print(f"\nProject directory: {project_dir}")
    print(f"Spec: {spec_dir.name}")
    print(f"Model: {args.model}")

    if args.max_iterations:
        print(f"Max iterations: {args.max_iterations}")
    else:
        print("Max iterations: Unlimited (runs until all tests pass)")

    print()

    # Validate environment
    if not validate_environment(spec_dir):
        sys.exit(1)

    # Run the autonomous agent
    try:
        asyncio.run(
            run_autonomous_agent(
                project_dir=project_dir,
                spec_dir=spec_dir,
                model=args.model,
                max_iterations=args.max_iterations,
                verbose=args.verbose,
            )
        )
    except KeyboardInterrupt:
        print("\n\n" + "-" * 70)
        print("  PAUSED BY USER (Ctrl+C)")
        print("-" * 70)
        print("\nProgress has been saved via Git commits.")

        # Offer to add human input
        try:
            print("\n" + "=" * 70)
            choice = input("Add instructions for the agent? (y/n, or Ctrl+C to exit): ").strip().lower()

            if choice in ['y', 'yes']:
                print("\nEnter your instructions for the agent.")
                print("Press Enter on an empty line when done:")
                print("-" * 70)

                lines = []
                empty_count = 0
                while True:
                    try:
                        line = input()
                        if line == "":
                            empty_count += 1
                            if empty_count >= 1:  # Stop on first empty line
                                break
                        else:
                            empty_count = 0
                            lines.append(line)
                    except KeyboardInterrupt:
                        print("\n\nExiting without saving instructions...")
                        sys.exit(0)

                human_input = "\n".join(lines).strip()

                if human_input:
                    # Save to HUMAN_INPUT.md
                    input_file = spec_dir / "HUMAN_INPUT.md"
                    input_file.write_text(human_input)
                    print("\n" + "=" * 70)
                    print("  INSTRUCTIONS SAVED")
                    print("=" * 70)
                    print(f"\nYour instructions have been saved to:")
                    print(f"  {input_file}")
                    print("\nThe agent will read and follow these instructions when you resume.")
                else:
                    print("\nNo instructions provided.")

        except KeyboardInterrupt:
            # User pressed Ctrl+C again during input prompt - exit immediately
            print("\n\nExiting...")
            sys.exit(0)
        except EOFError:
            # stdin closed
            pass

        print("\n" + "-" * 70)
        print("  TO RESUME")
        print("-" * 70)
        print(f"\nRun the same command:")
        print(f"  python auto-build/run.py --spec {spec_dir.name}")
        print()
    except Exception as e:
        print(f"\nFatal error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
