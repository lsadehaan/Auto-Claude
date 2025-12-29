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

# Test 3: Verify all facade exports match core exports
echo "✓ Verifying facade exports..."
$PYTHON -c "
import sys
from core.progress import __all__ as core_all
from progress import __all__ as facade_all

core_set = set(core_all)
facade_set = set(facade_all)

if core_set != facade_set:
    missing = core_set - facade_set
    extra = facade_set - core_set
    if missing:
        print(f'❌ Missing exports in progress.py: {missing}')
    if extra:
        print(f'⚠️  Extra exports in progress.py: {extra}')
    sys.exit(1)
" || exit 1
echo "  ✅ Facade exports complete"
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
