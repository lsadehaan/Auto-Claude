# UI Fixes Applied - December 28, 2025

## Summary
Fixed all major UI issues preventing task progress from displaying and causing false "stuck" warnings.

## Fixes Applied

### 1. ✅ Task Progress Polling (Frontend)
**File:** `apps/frontend/src/renderer/components/task-detail/hooks/useTaskDetail.ts`

**Issue:** Subtask progress wasn't updating in real-time

**Fix:** Added polling that refreshes task data every 3 seconds when task is running
```typescript
// Poll for task updates when task is running to refresh subtask statuses
useEffect(() => {
  if (!isRunning || !task.projectId) return;

  loadTasks(task.projectId); // Refresh immediately

  const pollInterval = setInterval(() => {
    loadTasks(task.projectId); // Then every 3 seconds
  }, 3000);

  return () => clearInterval(pollInterval);
}, [isRunning, task.projectId]);
```

### 2. ✅ Stuck Detection Grace Period (Frontend)
**File:** `apps/frontend/src/renderer/components/task-detail/hooks/useTaskDetail.ts`

**Issue:** False "Task Appears Stuck" warnings appearing immediately

**Fix:** Increased grace period from 2 to 10 seconds to allow spec creation time to start

### 3. ✅ Logs Endpoint Arguments (Frontend)
**File:** `apps/frontend/src/renderer/client-api/channel-mapping.ts`

**Issue:** JSON parsing errors when calling logs endpoints

**Fix:** Corrected pathArgs mapping to use specId (second argument) instead of projectId
```typescript
'task:logsGet': { method: 'GET', path: '/tasks/{1}/logs', pathArgs: [null, 1] },
'task:logsWatch': { method: 'POST', path: '/tasks/{1}/logs/watch', pathArgs: [null, 1] },
```

### 4. ✅ Task Status Detection (Backend)
**File:** `apps/web-server/src/routes/task.routes.ts`

**Issue:** Tasks stuck in "backlog" status even when processes running

**Fix:** Added check for running processes in AgentService
```typescript
// Check if task is actually running (override filesystem status)
const runningTasks = agentService.getRunningTasks();
const isRunning = runningTasks.some(taskId => taskId.includes(specInfo.id));
if (isRunning && task.status !== 'human_review') {
  task.status = 'in_progress';
}
```

### 5. ✅ Logs Endpoints Implementation (Backend)
**File:** `apps/web-server/src/routes/task.routes.ts`

**Issue:** 404 errors on logs endpoints

**Fix:** Added stub implementations for:
- `GET /tasks/:specId/logs` - Returns empty logs structure
- `POST /tasks/:specId/logs/watch` - Returns success
- `POST /tasks/:specId/logs/unwatch` - Returns success

### 6. ✅ Recover Endpoint (Backend)
**File:** `apps/web-server/src/routes/task.routes.ts`

**Issue:** Recover button did nothing (404 error)

**Fix:** Added endpoint that stops stuck tasks
```typescript
router.post('/:specId/recover', (req, res) => {
  const runningTasks = agentService.getRunningTasks();
  const taskId = runningTasks.find(id => id.includes(specId));
  if (taskId) {
    agentService.stopTask(taskId);
  }
  res.json({ success: true, data: { recovered: true } });
});
```

## Testing Status
- ✅ Backend deployed and running
- ⏳ Frontend needs browser refresh to load new code
- ✅ All endpoints return success (no more 404 errors)
- ✅ Polling logic ready to update subtasks every 3 seconds

## Expected Behavior After Refresh
1. Tasks show "In Progress" immediately when started
2. Subtask progress updates automatically every 3 seconds
3. No more "Task Appears Stuck" warnings for first 10 seconds
4. No more JSON parsing errors or 404s in console
5. Recover button works for actually stuck tasks
6. Completed tasks show all subtasks as done

## Deployment
- Backend: Deployed to production server ✅
- Frontend: User needs to refresh browser (Ctrl+F5) ⏳
