#!/bin/bash
# Pre-Deployment Verification Script
# Run this before deploying to verify all critical imports and functionality work

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔍 Verifying deployment readiness..."
echo ""

# Use venv python if available, otherwise system python
if [ -f ".venv/bin/python3" ]; then
    PYTHON=".venv/bin/python3"
else
    PYTHON="python3"
fi

echo "Using Python: $PYTHON"
echo ""

# Test 1: Verify critical imports work
echo "✓ Testing critical imports..."
$PYTHON -c "from progress import sync_progress_from_reality" || {
    echo "❌ FAILED: Missing export in progress.py"
    exit 1
}

$PYTHON -c "from agents.reviewer import review_subtask, review_task" || {
    echo "❌ FAILED: Missing reviewer imports"
    exit 1
}

$PYTHON -c "from core.progress import sync_progress_from_reality" || {
    echo "❌ FAILED: Missing core.progress function"
    exit 1
}

$PYTHON -c "from phase_config import get_feature_model, get_feature_thinking_budget" || {
    echo "❌ FAILED: Missing phase_config imports"
    exit 1
}

echo "  ✅ All critical imports working"
echo ""

# Test 2: Verify backend can start without errors
echo "✓ Testing backend startup..."
timeout 10 $PYTHON run.py --help > /dev/null 2>&1 || {
    echo "❌ FAILED: Backend crashes on startup"
    exit 1
}
echo "  ✅ Backend starts successfully"
echo ""

# Test 3: Verify critical facade exports exist
echo "✓ Verifying facade exports..."
$PYTHON -c "
import sys
from progress import __all__ as facade_all

required_exports = [
    'sync_progress_from_reality',
    'count_subtasks',
    'get_next_subtask',
    'print_progress_summary'
]

facade_set = set(facade_all)
missing = [exp for exp in required_exports if exp not in facade_set]

if missing:
    print(f'❌ Missing critical exports in progress.py: {missing}')
    sys.exit(1)
" || exit 1
echo "  ✅ Critical exports present"
echo ""

# Test 4: Verify dependencies are installed
echo "✓ Checking dependencies..."
$PYTHON -c "import claude_agent_sdk" 2>/dev/null || {
    echo "❌ FAILED: claude_agent_sdk not installed"
    echo "   Run: pip install -r requirements.txt"
    exit 1
}
echo "  ✅ Dependencies installed"
echo ""

echo "✅ All deployment checks passed - safe to deploy"
exit 0
