"""
Prompt Loading Utilities
========================

Functions for loading agent prompts from markdown files.
"""

from pathlib import Path


# Directory containing prompt files
PROMPTS_DIR = Path(__file__).parent / "prompts"


def get_initializer_prompt(spec_dir: Path) -> str:
    """
    Load the initializer agent prompt with spec path injected.

    Args:
        spec_dir: Directory containing the spec.md file

    Returns:
        The initializer prompt content with spec path
    """
    prompt_file = PROMPTS_DIR / "initializer.md"

    if not prompt_file.exists():
        raise FileNotFoundError(
            f"Initializer prompt not found at {prompt_file}\n"
            "Make sure the auto-build/prompts/initializer.md file exists."
        )

    prompt = prompt_file.read_text()

    # Inject spec directory information at the beginning
    spec_context = f"""## SPEC LOCATION

Your spec file is located at: `{spec_dir}/spec.md`

Store all build artifacts in this spec directory:
- `{spec_dir}/feature_list.json` - Test registry
- `{spec_dir}/progress.txt` - Progress notes

The project root is the parent of auto-build/. Implement code in the project root, not in the spec directory.

---

"""
    return spec_context + prompt


def get_coding_prompt(spec_dir: Path) -> str:
    """
    Load the coding agent prompt with spec path injected.

    Args:
        spec_dir: Directory containing the spec.md and feature_list.json

    Returns:
        The coding agent prompt content with spec path
    """
    prompt_file = PROMPTS_DIR / "coder.md"

    if not prompt_file.exists():
        raise FileNotFoundError(
            f"Coding prompt not found at {prompt_file}\n"
            "Make sure the auto-build/prompts/coder.md file exists."
        )

    prompt = prompt_file.read_text()

    # Inject spec directory information at the beginning
    spec_context = f"""## SPEC LOCATION

Your spec and progress files are located at:
- Spec: `{spec_dir}/spec.md`
- Test registry: `{spec_dir}/feature_list.json`
- Progress notes: `{spec_dir}/progress.txt`

The project root is the parent of auto-build/. All code goes in the project root, not in the spec directory.

---

"""

    # Check for human input file
    human_input_file = spec_dir / "HUMAN_INPUT.md"
    if human_input_file.exists():
        human_input = human_input_file.read_text().strip()
        if human_input:
            spec_context += f"""## HUMAN INPUT (READ THIS FIRST!)

The human has left you instructions. READ AND FOLLOW THESE CAREFULLY:

{human_input}

After addressing this input, you may delete or clear the HUMAN_INPUT.md file.

---

"""

    return spec_context + prompt
