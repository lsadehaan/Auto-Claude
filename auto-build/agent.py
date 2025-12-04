"""
Agent Session Logic
===================

Core agent interaction functions for running autonomous coding sessions.
"""

import asyncio
from pathlib import Path
from typing import Optional

from claude_code_sdk import ClaudeSDKClient

from client import create_client
from progress import (
    print_session_header,
    print_progress_summary,
    count_passing_tests,
    is_build_complete,
)
from prompts import get_initializer_prompt, get_coding_prompt


# Configuration
AUTO_CONTINUE_DELAY_SECONDS = 3
HUMAN_INTERVENTION_FILE = "PAUSE"  # Create this file in spec dir to pause


async def run_agent_session(
    client: ClaudeSDKClient,
    message: str,
    project_dir: Path,
    verbose: bool = False,
) -> tuple[str, str]:
    """
    Run a single agent session using Claude Agent SDK.

    Args:
        client: Claude SDK client
        message: The prompt to send
        project_dir: Project directory path
        verbose: Whether to show detailed output

    Returns:
        (status, response_text) where status is:
        - "continue" if agent should continue working
        - "complete" if all tests pass
        - "error" if an error occurred
    """
    print("Sending prompt to Claude Agent SDK...\n")

    try:
        # Send the query
        await client.query(message)

        # Collect response text and show tool use
        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            # Handle AssistantMessage (text and tool use)
            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        print(f"\n[Tool: {block.name}]", flush=True)
                        if verbose and hasattr(block, "input"):
                            input_str = str(block.input)
                            if len(input_str) > 300:
                                print(f"   Input: {input_str[:300]}...", flush=True)
                            else:
                                print(f"   Input: {input_str}", flush=True)

            # Handle UserMessage (tool results)
            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "ToolResultBlock":
                        result_content = getattr(block, "content", "")
                        is_error = getattr(block, "is_error", False)

                        # Check if command was blocked by security hook
                        if "blocked" in str(result_content).lower():
                            print(f"   [BLOCKED] {result_content}", flush=True)
                        elif is_error:
                            # Show errors (truncated)
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                        else:
                            # Tool succeeded
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)

        print("\n" + "-" * 70 + "\n")

        # Check if build is complete
        if is_build_complete(project_dir):
            return "complete", response_text

        return "continue", response_text

    except Exception as e:
        print(f"Error during agent session: {e}")
        return "error", str(e)


async def run_autonomous_agent(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    max_iterations: Optional[int] = None,
    verbose: bool = False,
) -> None:
    """
    Run the autonomous agent loop.

    Args:
        project_dir: Root directory for the project
        spec_dir: Directory containing the spec (auto-build/specs/001-name/)
        model: Claude model to use
        max_iterations: Maximum number of iterations (None for unlimited)
        verbose: Whether to show detailed output
    """
    # Check if this is a fresh start or continuation
    # feature_list.json is stored in the spec directory
    tests_file = spec_dir / "feature_list.json"
    is_first_run = not tests_file.exists()

    if is_first_run:
        print("Fresh start - will use Initializer Agent")
        print()
        print("=" * 70)
        print("  INITIALIZER SESSION")
        print(f"  Spec: {spec_dir.name}")
        print("  The agent will analyze your spec and create a test plan.")
        print("  This may take 5-15 minutes depending on project scope.")
        print("=" * 70)
        print()
    else:
        print(f"Continuing build: {spec_dir.name}")
        print_progress_summary(spec_dir)

        # Check if already complete
        if is_build_complete(spec_dir):
            print("\n" + "=" * 70)
            print("  BUILD ALREADY COMPLETE!")
            print("=" * 70)
            print("\nAll tests are passing. The build is ready for human review.")
            print("\nNext steps:")
            print("  1. Review the code on the auto-build/* branch")
            print("  2. Run manual tests")
            print("  3. Merge to main when satisfied")
            return

    # Show human intervention hint
    print("-" * 70)
    print("  INTERACTIVE CONTROLS:")
    print("  Press Ctrl+C once  → Pause and optionally add instructions")
    print("  Press Ctrl+C twice → Exit immediately")
    print("-" * 70)
    print()

    # Main loop
    iteration = 0

    while True:
        iteration += 1

        # Check for human intervention (PAUSE file)
        pause_file = spec_dir / HUMAN_INTERVENTION_FILE
        if pause_file.exists():
            print("\n" + "=" * 70)
            print("  PAUSED BY HUMAN")
            print("=" * 70)

            # Check if there's a message in the PAUSE file
            pause_content = pause_file.read_text().strip()
            if pause_content:
                print(f"\nMessage: {pause_content}")

            print(f"\nTo resume, delete the PAUSE file:")
            print(f"  rm {pause_file}")
            print(f"\nThen run again:")
            print(f"  python auto-build/run.py --spec {spec_dir.name}")
            return

        # Check max iterations
        if max_iterations and iteration > max_iterations:
            print(f"\nReached max iterations ({max_iterations})")
            print("To continue, run the script again without --max-iterations")
            break

        # Print session header
        print_session_header(iteration, is_first_run)

        # Create client (fresh context) - working directory is project root
        # but the agent will read spec from spec_dir
        client = create_client(project_dir, spec_dir, model)

        # Choose prompt based on session type
        if is_first_run:
            prompt = get_initializer_prompt(spec_dir)
            is_first_run = False  # Only use initializer once
        else:
            prompt = get_coding_prompt(spec_dir)

        # Run session with async context manager
        async with client:
            status, response = await run_agent_session(
                client, prompt, spec_dir, verbose
            )

        # Handle status
        if status == "complete":
            print("\n" + "=" * 70)
            print("  BUILD COMPLETE!")
            print("=" * 70)
            print_progress_summary(spec_dir)
            print("\nAll tests are passing. The build is ready for human review.")
            print("\nNext steps:")
            print("  1. Review the code on the auto-build/* branch")
            print("  2. Run manual tests")
            print("  3. Create a PR and merge to main when satisfied")
            break

        elif status == "continue":
            print(f"\nAgent will auto-continue in {AUTO_CONTINUE_DELAY_SECONDS}s...")
            print_progress_summary(spec_dir)
            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        elif status == "error":
            print("\nSession encountered an error")
            print("Will retry with a fresh session...")
            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        # Small delay between sessions
        if max_iterations is None or iteration < max_iterations:
            print("\nPreparing next session...\n")
            await asyncio.sleep(1)

    # Final summary
    print("\n" + "=" * 70)
    print("  SESSION SUMMARY")
    print("=" * 70)
    print(f"\nProject directory: {project_dir}")
    print(f"Spec: {spec_dir.name}")
    print(f"Sessions completed: {iteration}")
    print_progress_summary(spec_dir)

    # Instructions
    print("\n" + "-" * 70)
    print("  NEXT STEPS")
    print("-" * 70)

    passing, total = count_passing_tests(spec_dir)
    if passing < total:
        print(f"\n  {total - passing} tests remaining.")
        print(f"  Run again to continue: python auto-build/run.py --spec {spec_dir.name}")
    else:
        print("\n  All tests passing!")
        print("  1. Review the auto-build/* branch")
        print("  2. Run manual tests")
        print("  3. Merge to main")

    print("-" * 70)
    print()
