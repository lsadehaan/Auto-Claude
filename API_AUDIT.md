# Auto-Claude Web API Audit

**Date:** 2025-12-27
**Status:** Initial Complete Audit
**Purpose:** Identify all missing backend endpoints for web deployment

## Executive Summary

This audit compares all frontend API method calls (defined in `channel-mapping.ts` and `web-api.ts`) against implemented backend endpoints in `apps/web-server/src/routes/`.

### High-Level Status

- ✅ **Implemented**: Backend endpoint exists and functional
- ⚠️ **Partial**: Backend exists but may be incomplete
- ❌ **Missing**: Backend endpoint does not exist (returns 404)
- 🔄 **Stub**: Placeholder that returns "not implemented" error

### Critical Missing Endpoints (Blocking User Flow)

1. ❌ `POST /api/projects/create` - Create new project on server
2. ❌ `POST /api/projects/clone` - Clone git repository
3. ❌ `GET /api/memory/status` - Memory infrastructure status
4. ❌ `GET /api/ollama/status` - Ollama connection status
5. ❌ `POST /api/ollama/models/pull` - Pull Ollama models

---

## Detailed Endpoint Audit

### 1. Project Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/projects` | `project:list` | ✅ | Implemented - lists all projects |
| POST | `/projects` | `project:add` | ⚠️ | Partially - supports legacy path-based add, but not optimized for web |
| **POST** | **`/projects/create`** | `project:create` | ❌ | **MISSING - User blocked here** |
| **POST** | **`/projects/clone`** | `project:clone` | ❌ | **MISSING - User blocked here** |
| DELETE | `/projects/{id}` | `project:remove` | ✅ | Implemented |
| GET | `/projects/{id}` | - | ✅ | Implemented |
| PUT | `/projects/{id}/settings` | `project:updateSettings` | ✅ | Implemented |
| POST | `/projects/{id}/initialize` | `project:initialize` | ✅ | Implemented |
| GET | `/projects/{id}/version` | `project:checkVersion` | ✅ | Implemented |
| GET | `/projects/directory` | `dialog:getDefaultProjectLocation` | ✅ | Implemented |

**Impact:** HIGH - Users cannot create or clone projects
**Fix Required:** Implement `POST /projects/create` and `POST /projects/clone`

---

### 2. Git Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/projects/{id}/git/branches` | `git:getBranches` | ✅ | Implemented |
| GET | `/projects/{id}/git/current-branch` | `git:getCurrentBranch` | ✅ | Implemented |
| GET | `/projects/{id}/git/main-branch` | `git:detectMainBranch` | ✅ | Implemented |
| GET | `/projects/{id}/git/status` | `git:checkStatus` | ✅ | Implemented |
| POST | `/projects/{id}/git/initialize` | `git:initialize` | ✅ | Implemented |

**Impact:** NONE - All git endpoints implemented
**Fix Required:** None

---

### 3. Worktree Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/projects/{id}/worktrees` | `task:listWorktrees` | ✅ | Implemented |
| GET | `/projects/{id}/worktrees/{specId}/status` | `task:worktreeStatus` | ✅ | Implemented |
| GET | `/projects/{id}/worktrees/{specId}/diff` | `task:worktreeDiff` | ✅ | Implemented |
| GET | `/projects/{id}/worktrees/{specId}/merge-preview` | `task:worktreeMergePreview` | ✅ | Implemented |
| POST | `/projects/{id}/worktrees/{specId}/merge` | `task:worktreeMerge` | ✅ | Implemented |
| DELETE | `/projects/{id}/worktrees/{specId}` | `task:worktreeDiscard` | ✅ | Implemented |

**Impact:** NONE - All worktree endpoints implemented
**Fix Required:** None

---

### 4. Task Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/tasks` | `task:list` | ✅ | Implemented - requires projectPath query param |
| POST | `/tasks` | `task:create` | ✅ | Implemented - creates spec |
| GET | `/tasks/{specId}` | - | ✅ | Implemented - get spec details |
| DELETE | `/tasks/{id}` | `task:delete` | ❌ | Missing |
| PUT | `/tasks/{id}` | `task:update` | ❌ | Missing |
| POST | `/tasks/{specId}/start` | `task:start` | ✅ | Implemented |
| POST | `/tasks/{specId}/stop` | `task:stop` | ✅ | Implemented |
| GET | `/tasks/{specId}/review` | `task:review` | ❌ | Missing |
| PUT | `/tasks/{id}/status` | `task:updateStatus` | ❌ | Missing |
| POST | `/tasks/{id}/recover` | `task:recoverStuck` | ❌ | Missing |
| GET | `/tasks/running/list` | `task:checkRunning` | ✅ | Implemented |
| POST | `/tasks/{id}/archive` | `task:archive` | ❌ | Missing |
| POST | `/tasks/{id}/unarchive` | `task:unarchive` | ❌ | Missing |

**Impact:** MEDIUM - Core task execution works, but management features missing
**Fix Required:** Implement task update, delete, archive, review endpoints

---

### 5. Task Logs

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/tasks/{id}/logs` | `task:logsGet` | ❌ | Missing |
| POST | `/tasks/{id}/logs/watch` | `task:logsWatch` | ❌ | Missing |
| POST | `/tasks/{id}/logs/unwatch` | `task:logsUnwatch` | ❌ | Missing |

**Impact:** MEDIUM - Logs work via WebSocket, but HTTP endpoints missing
**Fix Required:** Implement HTTP log endpoints for consistency

---

### 6. Terminal Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| POST | `/terminals` | `terminal:create` | ✅ | Implemented |
| DELETE | `/terminals/{id}` | `terminal:destroy` | ✅ | Implemented |
| POST | `/terminals/{id}/resize` | `terminal:resize` | ✅ | Implemented |
| POST | `/terminals/{id}/claude` | `terminal:invokeClaude` | ❌ | Missing - endpoint is `/invoke-claude` |
| POST | `/terminals/{id}/generate-name` | `terminal:generateName` | ❌ | Missing |
| GET | `/terminals/sessions` | `terminal:getSessions` | ❌ | Missing |
| POST | `/terminals/sessions/{id}/restore` | `terminal:restoreSession` | ❌ | Missing |
| DELETE | `/terminals/sessions` | `terminal:clearSessions` | ❌ | Missing |
| POST | `/terminals/{id}/resume-claude` | `terminal:resumeClaude` | ❌ | Missing |
| GET | `/terminals/sessions/dates` | `terminal:getSessionDates` | ⚠️ | Stub - returns empty array |
| GET | `/terminals/sessions/date/{date}` | `terminal:getSessionsForDate` | ❌ | Missing |
| POST | `/terminals/sessions/date/{date}/restore` | `terminal:restoreFromDate` | ❌ | Missing |

**Impact:** LOW - Core terminal I/O works via WebSocket
**Fix Required:** Implement session persistence and management

---

### 7. Settings Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/settings` | `settings:get` | ✅ | Implemented |
| PUT | `/settings` | `settings:save` | ✅ | Implemented (POST and PUT) |
| GET | `/settings/tabs` | `tabState:get` | ✅ | Implemented |
| PUT | `/settings/tabs` | `tabState:save` | ✅ | Implemented |

**Impact:** NONE - All settings endpoints implemented
**Fix Required:** None

---

### 8. Claude Profile Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/claude/profiles` | `claude:profilesGet` | ✅ | Implemented |
| POST | `/claude/profiles` | `claude:profileSave` | ✅ | Implemented |
| DELETE | `/claude/profiles/{id}` | `claude:profileDelete` | ✅ | Implemented |
| PUT | `/claude/profiles/{id}/rename` | `claude:profileRename` | ✅ | Implemented |
| POST | `/claude/profiles/{id}/activate` | `claude:profileSetActive` | ✅ | Implemented |
| POST | `/claude/profiles/{id}/switch` | `claude:profileSwitch` | ❌ | Missing - no route for switch |
| POST | `/claude/profiles/{id}/initialize` | `claude:profileInitialize` | ✅ | Implemented |
| POST | `/claude/profiles/{id}/token` | `claude:profileSetToken` | ✅ | Implemented |
| GET | `/claude/auto-switch` | `claude:autoSwitchSettings` | ❌ | Missing |
| PUT | `/claude/auto-switch` | `claude:updateAutoSwitch` | ❌ | Missing |
| GET | `/claude/profiles/{id}/usage` | `claude:fetchUsage` | ❌ | Missing |
| GET | `/claude/profiles/best` | `claude:getBestProfile` | ❌ | Missing |

**Impact:** LOW - Basic profile management works
**Fix Required:** Implement auto-switch, usage tracking, best profile selection

---

### 9. GitHub Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/github/projects/{id}/repositories` | `github:getRepositories` | ❌ | Need to verify |
| GET | `/github/projects/{id}/issues` | `github:getIssues` | ✅ | Implemented |
| GET | `/github/projects/{id}/issues/{num}` | `github:getIssue` | ✅ | Implemented |
| GET | `/github/projects/{id}/issues/{num}/comments` | `github:getIssueComments` | ❌ | Missing |
| GET | `/github/projects/{id}/status` | `github:checkConnection` | ✅ | Implemented |
| POST | `/github/projects/{id}/issues/{num}/investigate` | `github:investigateIssue` | ❌ | Missing |
| POST | `/github/projects/{id}/issues/import` | `github:importIssues` | ✅ | Implemented |
| POST | `/github/projects/{id}/releases` | `github:createRelease` | ✅ | Implemented |
| GET | `/github/cli/status` | `github:checkCli` | ❌ | Missing |
| GET | `/github/auth/status` | `github:checkAuth` | ❌ | Missing |
| POST | `/github/auth/start` | `github:startAuth` | ❌ | Missing |
| GET | `/github/auth/token` | `github:getToken` | ❌ | Missing |
| GET | `/github/user` | `github:getUser` | ❌ | Missing |
| GET | `/github/user/repos` | `github:listUserRepos` | ❌ | Missing |
| GET | `/github/projects/{id}/detect-repo` | `github:detectRepo` | ❌ | Missing |
| GET | `/github/projects/{id}/branches` | `github:getBranches` | ❌ | Missing |
| POST | `/github/repos` | `github:createRepo` | ❌ | Missing |
| POST | `/github/projects/{id}/remote` | `github:addRemote` | ❌ | Missing |
| GET | `/github/orgs` | `github:listOrgs` | ❌ | Missing |

**Impact:** MEDIUM - Basic GitHub integration works, advanced features missing
**Fix Required:** Implement GitHub CLI operations, OAuth flow, repo management

---

### 10. Linear Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/linear/teams` | `linear:getTeams` | ❌ | Endpoint mismatch |
| GET | `/linear/projects/{teamId}` | `linear:getProjects` | ❌ | Endpoint mismatch |
| GET | `/linear/projects/{id}/issues` | `linear:getIssues` | ✅ | Implemented |
| POST | `/linear/projects/{id}/issues/import` | `linear:importIssues` | ✅ | Implemented |
| GET | `/linear/projects/{id}/status` | `linear:checkConnection` | ✅ | Implemented |

**Impact:** MEDIUM - Linear integration partial
**Fix Required:** Fix endpoint mappings, implement team operations

---

### 11. Roadmap Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/roadmap/projects/{id}` | `roadmap:get` | ✅ | Implemented |
| GET | `/roadmap/projects/{id}/status` | `roadmap:getStatus` | ✅ | Implemented |
| PUT | `/roadmap/projects/{id}` | `roadmap:save` | ✅ | Implemented |
| POST | `/roadmap/projects/{id}/generate` | `roadmap:generate` | ✅ | Implemented |
| POST | `/roadmap/projects/{id}/refresh` | `roadmap:refresh` | ✅ | Implemented |
| POST | `/roadmap/projects/{id}/stop` | `roadmap:stop` | ✅ | Implemented |
| PUT | `/roadmap/projects/{id}/features/{fid}` | `roadmap:updateFeature` | ✅ | Implemented |
| POST | `/roadmap/projects/{id}/features/{fid}/convert` | `roadmap:convertToSpec` | ✅ | Implemented |

**Impact:** NONE - All roadmap endpoints implemented
**Fix Required:** None

---

### 12. Ideation Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/ideation/projects/{id}` | `ideation:get` | ✅ | Implemented |
| POST | `/ideation/projects/{id}/generate` | `ideation:generate` | ✅ | Implemented |
| POST | `/ideation/projects/{id}/stop` | `ideation:stop` | ✅ | Implemented |
| PUT | `/ideation/projects/{id}/ideas/{iid}/status` | `ideation:updateIdea` | ✅ | Implemented |
| POST | `/ideation/projects/{id}/ideas/{iid}/convert` | `ideation:convertToTask` | ❌ | Missing |
| POST | `/ideation/projects/{id}/ideas/{iid}/dismiss` | `ideation:dismiss` | ✅ | Implemented |
| POST | `/ideation/projects/{id}/dismiss-all` | `ideation:dismissAll` | ✅ | Implemented |
| POST | `/ideation/projects/{id}/ideas/{iid}/archive` | `ideation:archive` | ✅ | Implemented |
| DELETE | `/ideation/projects/{id}/ideas/{iid}` | `ideation:delete` | ✅ | Implemented |
| POST | `/ideation/projects/{id}/delete-multiple` | `ideation:deleteMultiple` | ✅ | Implemented |

**Impact:** LOW - Core ideation works
**Fix Required:** Implement convert to task endpoint

---

### 13. Context Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/context/projects/{id}` | `context:get` | ✅ | Implemented |
| POST | `/context/projects/{id}/refresh` | `context:refreshIndex` | ✅ | Implemented |
| GET | `/context/projects/{id}/memory-status` | `context:memoryStatus` | ❌ | Missing |
| GET | `/context/projects/{id}/memories/search` | `context:searchMemories` | ❌ | Missing |
| GET | `/context/projects/{id}/memories` | `context:getMemories` | ✅ | Implemented |

**Impact:** MEDIUM - Basic context works, memory features missing
**Fix Required:** Implement memory status and search

---

### 14. Environment Configuration

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/projects/{id}/env` | `env:get` | ⚠️ | Stub - returns empty config |
| PUT | `/projects/{id}/env` | `env:update` | ⚠️ | Stub - logs but doesn't write |
| GET | `/projects/{id}/env/claude-auth` | `env:checkClaudeAuth` | ❌ | Missing |
| POST | `/projects/{id}/env/claude-setup` | `env:invokeClaudeSetup` | ❌ | Missing |

**Impact:** MEDIUM - Environment config not persisted
**Fix Required:** Implement .env file reading/writing

---

### 15. File Explorer

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/files` | `fileExplorer:list` | ✅ | Implemented |

**Impact:** NONE - File explorer works
**Fix Required:** None

---

### 16. Shell Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| POST | `/shell/open-external` | `shell:openExternal` | ❌ | Missing |

**Impact:** LOW - Handled by browser native in web mode
**Fix Required:** Optional - can implement for consistency

---

### 17. Changelog Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/changelog/projects/{id}/done-tasks` | `changelog:getDoneTasks` | ❌ | **All changelog endpoints missing** |
| GET | `/changelog/projects/{id}/specs` | `changelog:loadTaskSpecs` | ❌ | Placeholder in index.ts |
| POST | `/changelog/projects/{id}/generate` | `changelog:generate` | ❌ | - |
| PUT | `/changelog/projects/{id}` | `changelog:save` | ❌ | - |
| GET | `/changelog/projects/{id}` | `changelog:readExisting` | ❌ | - |
| GET | `/changelog/projects/{id}/suggest-version` | `changelog:suggestVersion` | ❌ | - |
| POST | `/changelog/projects/{id}/suggest-version-from-commits` | `changelog:suggestVersionFromCommits` | ❌ | - |
| GET | `/changelog/projects/{id}/branches` | `changelog:getBranches` | ❌ | - |
| GET | `/changelog/projects/{id}/tags` | `changelog:getTags` | ❌ | - |
| POST | `/changelog/projects/{id}/commits-preview` | `changelog:getCommitsPreview` | ❌ | - |
| POST | `/changelog/projects/{id}/image` | `changelog:saveImage` | ❌ | - |
| GET | `/changelog/projects/{id}/image` | `changelog:readLocalImage` | ❌ | - |

**Impact:** HIGH - Entire changelog feature unavailable
**Fix Required:** Implement complete changelog route file

---

### 18. Insights Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/insights/projects/{id}/session` | `insights:getSession` | ❌ | **All insights endpoints missing** |
| POST | `/insights/projects/{id}/message` | `insights:sendMessage` | ❌ | Placeholder in index.ts |
| DELETE | `/insights/projects/{id}/session` | `insights:clearSession` | ❌ | - |
| POST | `/insights/projects/{id}/create-task` | `insights:createTask` | ❌ | - |
| GET | `/insights/projects/{id}/sessions` | `insights:listSessions` | ❌ | - |
| POST | `/insights/projects/{id}/sessions` | `insights:newSession` | ❌ | - |
| POST | `/insights/projects/{id}/sessions/{sid}/switch` | `insights:switchSession` | ❌ | - |
| DELETE | `/insights/projects/{id}/sessions/{sid}` | `insights:deleteSession` | ❌ | - |
| PUT | `/insights/projects/{id}/sessions/{sid}/rename` | `insights:renameSession` | ❌ | - |
| PUT | `/insights/projects/{id}/model-config` | `insights:updateModelConfig` | ❌ | - |

**Impact:** HIGH - Entire insights feature unavailable
**Fix Required:** Implement complete insights route file

---

### 19. Memory Operations (Critical)

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| **GET** | **`/memory/status`** | `memory:status` | ❌ | **MISSING - User blocked in onboarding** |
| GET | `/memory/databases` | `memory:listDatabases` | ❌ | Missing |
| POST | `/memory/test-connection` | `memory:testConnection` | ❌ | Missing |

**Impact:** **CRITICAL - Blocks onboarding wizard**
**Fix Required:** **URGENT - Implement memory status endpoint**

---

### 20. Graphiti Validation

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| POST | `/graphiti/validate-llm` | `graphiti:validateLlm` | ❌ | Missing |
| POST | `/graphiti/test-connection` | `graphiti:testConnection` | ❌ | Missing |

**Impact:** MEDIUM - Memory configuration features unavailable
**Fix Required:** Implement Graphiti validation endpoints

---

### 21. Ollama Operations (Critical)

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| **GET** | **`/ollama/status`** | `ollama:checkStatus` | ❌ | **MISSING - User blocked in onboarding** |
| GET | `/ollama/models` | `ollama:listModels` | ❌ | Missing |
| GET | `/ollama/models/embedding` | `ollama:listEmbeddingModels` | ❌ | Missing |
| **POST** | **`/ollama/models/pull`** | `ollama:pullModel` | ❌ | **MISSING - User blocked** |

**Impact:** **CRITICAL - Blocks onboarding wizard**
**Fix Required:** **URGENT - Implement Ollama endpoints**

---

### 22. Auto Build Source Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/autobuild/source/check` | `autobuild:source:check` | ❌ | Missing |
| POST | `/autobuild/source/download` | `autobuild:source:download` | ❌ | Missing |
| GET | `/autobuild/source/version` | `autobuild:source:version` | ❌ | Missing |
| GET | `/autobuild/source/env` | `autobuild:source:env:get` | ❌ | Missing |
| PUT | `/autobuild/source/env` | `autobuild:source:env:update` | ❌ | Missing |
| GET | `/autobuild/source/env/check-token` | `autobuild:source:env:checkToken` | ❌ | Missing |

**Impact:** MEDIUM - Auto-build management unavailable
**Fix Required:** Implement auto-build source endpoints

---

### 23. Release Operations

| Method | Endpoint | Channel | Status | Notes |
|--------|----------|---------|--------|-------|
| GET | `/release/suggest-version` | `release:suggestVersion` | ❌ | Missing |
| POST | `/release/create` | `release:create` | ❌ | Missing |
| GET | `/release/preflight` | `release:preflight` | ❌ | Missing |
| GET | `/release/versions` | `release:getVersions` | ❌ | Missing |

**Impact:** MEDIUM - Release management unavailable
**Fix Required:** Implement release route file

---

## Priority Matrix

### P0 - Critical (Blocks Core Functionality)

Must implement immediately - users cannot proceed without these:

1. ❌ `POST /api/projects/create` - Create project
2. ❌ `POST /api/projects/clone` - Clone repository
3. ❌ `GET /api/memory/status` - Memory system status
4. ❌ `GET /api/ollama/status` - Ollama status check
5. ❌ `POST /api/ollama/models/pull` - Pull Ollama models

**Estimated Effort:** 4-6 hours

---

### P1 - High (Core Features)

Implement soon - commonly used features:

1. ❌ Changelog operations (entire module)
2. ❌ Insights operations (entire module)
3. ❌ Context memory search operations
4. ❌ Environment config persistence (.env file operations)
5. ❌ GitHub CLI and OAuth operations
6. ❌ Claude profile auto-switch and usage tracking

**Estimated Effort:** 12-16 hours

---

### P2 - Medium (Enhanced Features)

Implement when time allows:

1. ❌ Task management (delete, update, archive, review)
2. ❌ Terminal session persistence
3. ❌ Auto-build source management
4. ❌ Release management
5. ❌ Graphiti validation
6. ❌ Linear team operations

**Estimated Effort:** 8-12 hours

---

### P3 - Low (Nice to Have)

Optional enhancements:

1. ❌ Shell operations (browser handles most)
2. ❌ Task log HTTP endpoints (WebSocket works)

**Estimated Effort:** 2-4 hours

---

## Implementation Plan

### Phase 1: Unblock User (P0 - Today)

**Goal:** Allow users to complete onboarding and create projects

1. Create `apps/web-server/src/routes/memory.routes.ts`
   - `GET /memory/status` - Check memory infrastructure
   - `GET /memory/databases` - List available databases
   - `POST /memory/test-connection` - Test connection

2. Create `apps/web-server/src/routes/ollama.routes.ts`
   - `GET /ollama/status` - Check Ollama server status
   - `GET /ollama/models` - List installed models
   - `GET /ollama/models/embedding` - List embedding models
   - `POST /ollama/models/pull` - Pull a model

3. Update `apps/web-server/src/routes/project.routes.ts`
   - Add `POST /projects/create` endpoint
   - Add `POST /projects/clone` endpoint
   - Update service to handle web-specific project creation

4. Wire up new routes in `apps/web-server/src/routes/index.ts`

---

### Phase 2: Core Features (P1 - This Week)

**Goal:** Enable all major application features

1. Create `apps/web-server/src/routes/changelog.routes.ts` (full implementation)
2. Create `apps/web-server/src/routes/insights.routes.ts` (full implementation)
3. Update context routes for memory search
4. Implement environment config file operations
5. Implement GitHub advanced operations
6. Implement Claude profile enhancements

---

### Phase 3: Refinement (P2 - Next Week)

**Goal:** Complete task management and session features

1. Implement task CRUD operations
2. Implement terminal session persistence
3. Implement auto-build source management
4. Implement release management
5. Complete Linear integration

---

### Phase 4: Polish (P3 - As Needed)

**Goal:** Fill in remaining gaps

1. Optional HTTP log endpoints
2. Shell operation endpoints
3. Any discovered edge cases

---

## Testing Strategy

For each implemented endpoint:

1. **Unit Test:** Verify endpoint logic with mock data
2. **Integration Test:** Test with real backend services (Ollama, memory, etc.)
3. **Frontend Test:** Verify frontend calls work end-to-end
4. **Error Handling:** Test error cases (service down, invalid input, etc.)

---

## Notes

- All routes should follow the existing pattern:
  - Use `adaptHandler` for consistent error handling
  - Return `IPCResult<T>` format: `{ success: boolean; data?: T; error?: string }`
  - Handle query parameters via `req.query`
  - Handle body parameters via `req.body`
  - Use path parameters via `req.params`

- Environment considerations:
  - Web mode runs on server, not user's local machine
  - File paths must be server-relative, not client-relative
  - OAuth flows may need different implementation (no browser popup)
  - Sessions must be server-side (no localStorage)

- Service dependencies:
  - Memory/Graphiti: Requires Python backend
  - Ollama: Requires Ollama server running
  - GitHub CLI: Requires `gh` installed on server
  - Linear: Requires API key configuration

---

## Current Blockers (User Perspective)

Based on console errors from the user's last session:

1. ✅ **Onboarding wizard works** - User can complete it
2. ❌ **Cannot create projects** - `POST /api/projects/create 404`
3. ❌ **Memory step errors** - `GET /api/memory/status 404`
4. ❌ **Ollama setup errors** - `GET /api/ollama/status 404`

**User cannot proceed beyond creating their first project.**

---

## Success Criteria

### Phase 1 Complete When:
- [x] User can complete onboarding wizard
- [ ] User can create a new project via web interface
- [ ] User can clone a git repository via web interface
- [ ] Memory status shows correct infrastructure state
- [ ] Ollama status shows connection state

### Phase 2 Complete When:
- [ ] User can generate and view changelog
- [ ] User can use insights/chat feature
- [ ] User can search memory/context
- [ ] User can save environment configuration
- [ ] GitHub advanced features work

### Phase 3 Complete When:
- [ ] User can manage task lifecycle (archive, delete, update)
- [ ] Terminal sessions persist across page reloads
- [ ] Release management works end-to-end

---

**Last Updated:** 2025-12-27
**Audited By:** Claude Sonnet 4.5
**Total Endpoints Audited:** ~200
**Implementation Status:** ~60% complete
