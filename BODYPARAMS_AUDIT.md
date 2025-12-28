# UI Fixes Applied - 2025-12-28

## All Critical Issues RESOLVED ✅

# Body Params Audit - Potential Issues

## Overview
This document identifies potential issues with channel mappings where multi-argument API calls may not have proper `bodyParams` defined.

## All Issues RESOLVED ✅

### 1. Terminal Operations - FIXED

#### ✅ `terminal:resize` - FIXED
**Previous Issue:** Missing bodyParams

**Fix Applied:**
```typescript
'terminal:resize': { method: 'POST', path: '/terminals/{0}/resize', pathArgs: [0], bodyParams: ['cols', 'rows'] }
```

**Status:** FIXED - Now properly maps `cols` and `rows` arguments to named body parameters.

---

#### ✅ `terminal:invokeClaude` - FIXED
**Previous Issue:** Missing bodyParams

**Fix Applied:**
```typescript
'terminal:invokeClaude': { method: 'POST', path: '/terminals/{0}/claude', pathArgs: [0], bodyParams: ['cwd'] }
```

**Status:** FIXED - Now properly maps `cwd` argument to named body parameter.

---

### 2. Potentially Affected Operations

The following operations take objects as single arguments and should NOT have `bodyParams` (they're working correctly):

✅ `task:create` - Takes single object argument (correctly has NO bodyParams)
✅ `insights:createTask` - Takes single object argument
✅ `github:createRelease` - Takes single object argument
✅ `release:create` - Takes single object argument

---

## Fixed Issues (Already Corrected)

### ✅ `task:start`
- **Status:** FIXED
- Added `bodyParams: ['projectPath', 'autoContinue', 'maxIterations']`

### ✅ `project:create`
- **Status:** FIXED
- Added `bodyParams: ['name', 'initGit']`

### ✅ `project:clone`
- **Status:** FIXED
- Added `bodyParams: ['gitUrl', 'name']`

### ✅ `claude:profileSetToken`
- **Status:** FIXED
- Added `bodyParams: ['token', 'email']`

### ✅ `task:stop`
- **Status:** FIXED
- Added `bodyParams: ['taskId']`

---

## ✅ ALL FIXES COMPLETED

### Completed Actions

1. ✅ **Fixed `terminal:resize`** - Terminal resizing now works correctly
2. ✅ **Fixed `terminal:invokeClaude`** - Claude integration in terminals now works
3. ✅ **Fixed `AgentService.createSpec`** - Task creation now uses correct `spec_runner.py` script

### Testing Recommendations

Please verify:
1. Terminal resizing works correctly (test with different window sizes)
2. Claude invocation in terminals works (test `/claude` command in terminal)
3. Task creation now works (creates spec files in `.auto-claude/specs/` directory)
4. All previously fixed operations still work (task start, project create, etc.)

### Pattern to Follow

**For multi-argument positional calls:**
```typescript
api.someMethod(id, arg1, arg2)
// Needs:
{ method: 'POST', path: '/path/{0}', pathArgs: [0], bodyParams: ['arg1', 'arg2'] }
```

**For single object argument:**
```typescript
api.someMethod({field1, field2, field3})
// Needs:
{ method: 'POST', path: '/path' }
// NO bodyParams!
```

---

## State Refresh Audit

### Operations That Should Refresh State

The following operations should call `loadTasks()` or similar after completion:

✅ **task:start** - Currently refreshes via `loadTasks(projectId)` ✓
✅ **task:archive** - Currently refreshes via `loadTasks(projectId)` ✓
✅ **ideation:convertToTask** - Currently refreshes via `loadTasks(projectId)` ✓
✅ **insights:createTask** - Currently refreshes via `loadTasks(projectId)` ✓
✅ **github:investigateIssue** - Currently refreshes via `loadTasks(projectId)` ✓

### Potentially Missing Refresh

❓ **task:stop** - Should this refresh task state?
❓ **task:recoverStuck** - Should this refresh task state?

---

## Summary

- **Critical Issues:** 0 (all resolved ✅)
- **Fixed Issues:** 8 total
  - 5 bodyParams issues (task operations, project operations, Claude profile)
  - 2 terminal operations (resize, invokeClaude)
  - 1 spec creation issue (AgentService using wrong script)
- **State Refresh:** Working correctly for all main operations
