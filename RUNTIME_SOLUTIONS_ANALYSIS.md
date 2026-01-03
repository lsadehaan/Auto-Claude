# Runtime Bundling Issues - Solutions Analysis

## Problem Summary

**Core Issues:**
1. Frontend code imports Electron-specific packages (electron-updater, electron-log)
2. These packages use dynamic `require()` for Node.js built-ins (fs, events, etc.)
3. ESM bundles can't handle dynamic requires (esbuild replaces them with throw statements)
4. electron-log requires the 'electron' module at runtime via CommonJS require()

**Current Error:**
```
Error: Dynamic require of "fs" is not supported
  at ../frontend/node_modules/graceful-fs/graceful-fs.js
  at ../frontend/node_modules/electron-updater/...
```

## Solution Analysis

---

## Solution 1: Build-Time Conditional Compilation (tsup/esbuild defines)

### Description
Use esbuild's `define` feature to replace Electron-specific imports with stubs at build time, without changing source code.

### Implementation

```typescript
// apps/web-server/tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  esbuildOptions(options) {
    options.alias = {
      'electron': 'electron-to-web/main'
    };

    // Replace electron-specific modules with empty objects at build time
    options.define = {
      // Stub out electron-log
      'require("electron-log")': '{ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }',
      // Stub app-updater if not used in web
      'require("electron-updater")': '{ autoUpdater: {} }',
      // Define environment flag
      '__IS_WEB__': 'true',
    };
  },
});
```

Then frontend code could optionally use:
```typescript
// apps/frontend/src/main/app-logger.ts (optional enhancement)
declare const __IS_WEB__: boolean;

const log = typeof __IS_WEB__ !== 'undefined' && __IS_WEB__
  ? console
  : require('electron-log');
```

### Pros
- ✅ **No source code changes required** (if just stubbing imports)
- ✅ **Simple configuration** - just add defines to tsup config
- ✅ **Bundle size reduction** - electron-log and electron-updater removed entirely
- ✅ **Fast build times** - esbuild does replacement at parse time
- ✅ **Type-safe** - can add TypeScript declarations for defines
- ✅ **Works with ESM** - no require() issues

### Cons
- ⚠️ **May break code that depends on these modules** - need to verify what actually uses them
- ⚠️ **String-based replacement** - brittle, must match exact require syntax
- ⚠️ **Hard to debug** - replaced code is gone from bundle
- ⚠️ **Doesn't handle dynamic requires in other deps** - only works for top-level requires

### Potential Issues
1. **Cascading failures** - if stubbed modules are actually used, runtime errors
2. **Maintenance burden** - need to keep stubs in sync with actual APIs
3. **Deep imports** - requires like `require('electron-log/main')` need separate stubs

### Complexity: 🟢 Low (2-3 hours)
### Code Changes Required: 🟢 None (just config)
### Risk Level: 🟡 Medium (could break features)

**Overall Score: 8/10** - Simple, no code changes, but requires careful verification

---

## Solution 2: Don't Bundle Dependencies (noExternal: [])

### Description
Don't bundle node_modules at all - just transpile our source code and let Node.js resolve dependencies at runtime.

### Implementation

```typescript
// apps/web-server/tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  bundle: false, // Don't bundle anything
  // OR use noExternal to be selective:
  noExternal: [], // Everything is external (not bundled)

  esbuildOptions(options) {
    options.alias = {
      'electron': 'electron-to-web/main'
    };
  },
});
```

### Pros
- ✅ **Zero bundling issues** - dynamic requires work normally in node_modules
- ✅ **No source code changes** - everything runs as-is
- ✅ **Faster builds** - just transpile TypeScript, no bundling
- ✅ **Easier debugging** - can debug into node_modules
- ✅ **Natural module resolution** - Node.js handles everything

### Cons
- ❌ **Requires node_modules in production** - must deploy entire node_modules folder
- ❌ **Larger deployment size** - full dependency tree instead of bundle
- ❌ **Slower startup** - Node.js resolves modules on startup
- ❌ **Module aliasing doesn't work** - esbuild's alias only works when bundling
- ❌ **Can't tree-shake** - unused code still deployed

### Potential Issues
1. **Alias breaks** - The core module aliasing (`'electron'` → `'electron-to-web/main'`) won't work without bundling
2. **Deployment complexity** - need to ensure all deps installed on server
3. **Version conflicts** - frontend node_modules vs web-server node_modules

### Complexity: 🟢 Low (1-2 hours)
### Code Changes Required: 🟡 Medium (need alternative aliasing strategy)
### Risk Level: 🔴 High (breaks module aliasing)

**Overall Score: 4/10** - Simple but breaks core aliasing mechanism

---

## Solution 3: Separate Web-Specific Entry Point with Import Mapping

### Description
Create a web-specific version of the frontend IPC setup that excludes Electron-only dependencies, using a build-time import map.

### Implementation

**Step 1: Create web-specific IPC setup**
```typescript
// apps/frontend/src/main/ipc-setup.web.ts
// Imports only web-compatible handlers
import { registerProjectHandlers } from './ipc-handlers/project-handlers';
import { registerTaskHandlers } from './ipc-handlers/task-handlers';
import { registerTerminalHandlers } from './ipc-handlers/terminal-handlers';
// Skip: registerUpdaterHandlers (uses electron-updater)
// Skip: notification handlers (might use Electron notifications)

export function setupIpcHandlers(
  agentManager: AgentManager,
  terminalManager: TerminalManager,
  getMainWindow: () => BrowserWindow | null,
  pythonEnvManager: PythonEnvManager
): void {
  registerProjectHandlers(pythonEnvManager, agentManager, getMainWindow);
  registerTaskHandlers(agentManager, pythonEnvManager, getMainWindow);
  registerTerminalHandlers(terminalManager, getMainWindow);
  // ... only web-compatible handlers
}
```

**Step 2: Use tsup alias to swap entry point**
```typescript
// apps/web-server/tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',

  esbuildOptions(options) {
    options.alias = {
      'electron': 'electron-to-web/main',
      // Redirect to web-specific entry point
      '../../frontend/src/main/ipc-setup': '../../frontend/src/main/ipc-setup.web',
      // Stub electron-log globally
      'electron-log': 'electron-to-web/utils/console-logger',
    };
  },
});
```

**Step 3: Create console logger stub**
```typescript
// electron-to-web/src/utils/console-logger.ts
export default {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug,
  log: console.log,
};
```

### Pros
- ✅ **No changes to Electron code** - original files untouched
- ✅ **Clean separation** - web vs Electron handlers clearly separated
- ✅ **Full control** - explicitly choose which handlers to include
- ✅ **Type-safe** - TypeScript checks web compatibility
- ✅ **Gradual migration** - can add handlers one by one
- ✅ **Bundle optimization** - only includes needed code
- ✅ **Maintains aliasing** - core electron → electron-to-web still works

### Cons
- ⚠️ **Duplication** - need to maintain two IPC setup files
- ⚠️ **Manual curation** - must manually decide which handlers are web-compatible
- ⚠️ **Ongoing maintenance** - new handlers need web version too
- ⚠️ **Testing burden** - need to test both entry points

### Potential Issues
1. **Feature parity** - web version might lag behind Electron
2. **Import path complexity** - nested imports in handlers might still pull in Electron deps
3. **Missed dependencies** - handlers might transitively import electron-updater

### Complexity: 🟡 Medium (4-6 hours)
### Code Changes Required: 🟢 Minimal (create new file, don't modify existing)
### Risk Level: 🟢 Low (isolated, easy to test)

**Overall Score: 9/10** - Best balance of cleanliness and control

---

## Solution 4: Enhanced Electron Shim with ESM Support

### Description
Create a comprehensive electron shim package that properly exports both CommonJS and ESM, installed as a real package in node_modules.

### Implementation

**Step 1: Create electron-shim package**
```bash
mkdir apps/electron-shim
cd apps/electron-shim
npm init -y
```

**Step 2: Implement dual-format exports**
```json
// apps/electron-shim/package.json
{
  "name": "@auto-claude/electron-shim",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./main": {
      "import": "./dist/main.js",
      "require": "./dist/main.cjs"
    }
  }
}
```

```typescript
// apps/electron-shim/src/index.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Re-export electron-to-web
export * from 'electron-to-web/main';

// Override with enhanced implementations
export const app = {
  ...require('electron-to-web/main').app,
  // Enhanced getPath that actually works
  getPath: (name: string) => {
    switch (name) {
      case 'logs': return path.join(os.tmpdir(), 'auto-claude-logs');
      // ... full implementations
    }
  }
};
```

**Step 3: Install as dependency**
```bash
cd apps/web-server
npm install file:../electron-shim
```

**Step 4: Create electron alias in package.json**
```json
// apps/web-server/package.json
{
  "dependencies": {
    "@auto-claude/electron-shim": "file:../electron-shim"
  },
  "overrides": {
    "electron": "$@auto-claude/electron-shim"
  }
}
```

### Pros
- ✅ **Proper package structure** - works with all module systems
- ✅ **No source changes** - drop-in replacement
- ✅ **Full API surface** - can implement complete Electron API
- ✅ **Reusable** - other projects could use it
- ✅ **TypeScript support** - proper type definitions
- ✅ **Works with npm overrides** - forces all deps to use it

### Cons
- ❌ **Complex setup** - need to build dual CJS/ESM package
- ❌ **Maintenance** - need to keep API in sync
- ❌ **npm overrides brittle** - not all packages respect it
- ❌ **Deep imports break** - `require('electron/main')` won't work
- ❌ **Still requires bundling** - tsup must bundle to apply alias

### Potential Issues
1. **Version conflicts** - if real electron package installed
2. **Type mismatches** - Electron types vs shim types
3. **Override limitations** - some bundlers ignore npm overrides
4. **CommonJS/ESM mixing** - still complex to get right

### Complexity: 🔴 High (8-12 hours)
### Code Changes Required: 🟢 None (separate package)
### Risk Level: 🟡 Medium (complex to maintain)

**Overall Score: 6/10** - Comprehensive but complex

---

## Solution 5: Externalize Electron Dependencies + Runtime Stubs

### Description
Mark Electron-specific packages as external (don't bundle them), then provide runtime stubs in node_modules.

### Implementation

**Step 1: Externalize in tsup**
```typescript
// apps/web-server/tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',

  external: [
    // Don't bundle these - they'll be stubbed
    'electron-log',
    'electron-updater',
    'electron',
  ],

  esbuildOptions(options) {
    options.alias = {
      // Alias only works for bundled imports
      'electron': 'electron-to-web/main'
    };
  },
});
```

**Step 2: Create stub packages**
```bash
# Create electron-log stub
mkdir -p node_modules/electron-log
cat > node_modules/electron-log/package.json <<EOF
{
  "name": "electron-log",
  "main": "index.js",
  "type": "commonjs"
}
EOF

cat > node_modules/electron-log/index.js <<EOF
module.exports = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug
};
EOF
```

**Step 3: Create post-install script**
```json
// apps/web-server/package.json
{
  "scripts": {
    "postinstall": "node scripts/create-stubs.js"
  }
}
```

```javascript
// apps/web-server/scripts/create-stubs.js
const fs = require('fs');
const path = require('path');

const stubs = {
  'electron-log': {
    packageJson: { name: 'electron-log', main: 'index.js' },
    indexJs: `
      module.exports = {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.debug
      };
    `
  },
  'electron': {
    packageJson: { name: 'electron', main: 'index.cjs' },
    indexCjs: `
      const electronToWeb = require('electron-to-web/dist/main/index.js');
      module.exports = electronToWeb;
    `
  }
};

// Create stubs in node_modules
for (const [name, config] of Object.entries(stubs)) {
  const dir = path.join(__dirname, '../node_modules', name);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(config.packageJson, null, 2)
  );

  for (const [file, content] of Object.entries(config)) {
    if (file !== 'packageJson') {
      fs.writeFileSync(path.join(dir, file), content);
    }
  }
}
```

### Pros
- ✅ **No source changes** - works with existing code
- ✅ **Dynamic requires work** - packages resolved at runtime
- ✅ **Selective stubbing** - only stub what's needed
- ✅ **Easy to update** - just modify stub scripts
- ✅ **Works with CommonJS** - no ESM conversion needed

### Cons
- ⚠️ **Fragile** - npm install can overwrite stubs
- ⚠️ **Git issues** - node_modules not committed
- ⚠️ **CI/CD complexity** - must run postinstall
- ⚠️ **Module aliasing limited** - only works for externalized modules
- ⚠️ **Bundled imports different** - some imports bundled, some external

### Potential Issues
1. **npm install overwrites** - running npm install deletes stubs
2. **Lock file issues** - package-lock.json might conflict
3. **Deployment** - must ensure postinstall runs in production
4. **Mixed module formats** - some ESM, some CJS

### Complexity: 🟡 Medium (4-6 hours)
### Code Changes Required: 🟢 None (just scripts)
### Risk Level: 🟡 Medium (fragile CI/CD)

**Overall Score: 7/10** - Pragmatic but fragile

---

## Solution 6: Frontend Build with Conditional Exports

### Description
Modify the frontend build process to create a web-specific build that excludes Electron dependencies, then import that build instead of source files.

### Implementation

**Step 1: Add web build to frontend**
```json
// apps/frontend/package.json
{
  "scripts": {
    "build:web-main": "vite build --config vite.web-main.config.ts"
  }
}
```

```typescript
// apps/frontend/vite.web-main.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/ipc-setup.ts',
      formats: ['es'],
      fileName: 'ipc-setup'
    },
    rollupOptions: {
      external: [
        'electron-log', // Externalize - will be stubbed
        'electron-updater', // Externalize - not used in web
      ],
      output: {
        dir: 'dist/web-main',
        format: 'es'
      }
    }
  },
  define: {
    '__IS_WEB__': 'true', // Build-time flag
    'process.type': '"browser"' // Trick some Electron checks
  }
});
```

**Step 2: Import pre-built version**
```typescript
// apps/web-server/src/index.ts
import { setupIpcHandlers } from '../../frontend/dist/web-main/ipc-setup.js';
// Instead of: import { setupIpcHandlers } from '../../frontend/src/main/ipc-setup';
```

**Step 3: Add stub for electron-log in web-server**
```typescript
// apps/web-server/tsup.config.ts
export default defineConfig({
  esbuildOptions(options) {
    options.alias = {
      'electron': 'electron-to-web/main',
      'electron-log': path.resolve(__dirname, 'src/stubs/electron-log.ts')
    };
  }
});
```

```typescript
// apps/web-server/src/stubs/electron-log.ts
export default console;
```

### Pros
- ✅ **No Electron code changes** - frontend unchanged
- ✅ **Pre-built bundles** - can optimize for web separately
- ✅ **Clear separation** - web build vs Electron build
- ✅ **Vite tree-shaking** - removes unused code
- ✅ **Can use conditionals** - `if (__IS_WEB__)` branches removed
- ✅ **Type-safe** - TypeScript checks both builds

### Cons
- ⚠️ **Extra build step** - must build frontend for web separately
- ⚠️ **Build order dependency** - must build frontend before web-server
- ⚠️ **Debugging harder** - importing built code, not source
- ⚠️ **Slower iteration** - change → rebuild frontend → rebuild server

### Potential Issues
1. **Build order** - CI/CD must build in correct order
2. **Source maps** - need proper source map configuration
3. **Watch mode** - vite watch + tsup watch coordination
4. **Dependency sync** - frontend changes require rebuild

### Complexity: 🟡 Medium (6-8 hours)
### Code Changes Required: 🟢 Minimal (just build config)
### Risk Level: 🟢 Low (isolated builds)

**Overall Score: 8/10** - Clean separation, slightly slower iteration

---

## Comparison Matrix

| Solution | No Code Changes | Simplicity | Risk | Time | Score |
|----------|-----------------|------------|------|------|-------|
| **1. Build-Time Defines** | ✅ | 🟢 High | 🟡 Med | 2-3h | **8/10** |
| 2. Don't Bundle | ✅ | 🟢 High | 🔴 High | 1-2h | 4/10 |
| **3. Separate Entry Point** | ✅ | 🟡 Med | 🟢 Low | 4-6h | **9/10** |
| 4. Enhanced Shim | ✅ | 🔴 Low | 🟡 Med | 8-12h | 6/10 |
| 5. External + Stubs | ✅ | 🟡 Med | 🟡 Med | 4-6h | 7/10 |
| **6. Frontend Web Build** | ✅ | 🟡 Med | 🟢 Low | 6-8h | **8/10** |

---

## Top 3 Recommendations

### 🥇 #1: Separate Web-Specific Entry Point (Solution 3)
**Best for: Long-term maintainability and control**

```typescript
// Implementation summary:
// 1. Create apps/frontend/src/main/ipc-setup.web.ts
// 2. Import only web-compatible handlers
// 3. Alias in tsup: 'ipc-setup' → 'ipc-setup.web'
// 4. Stub electron-log via alias
```

**Why it wins:**
- No changes to Electron code (maintains upstream compatibility)
- Explicit control over what's included
- Clear separation of concerns
- Easy to understand and debug
- Low risk, gradual migration path

**Implementation steps:**
1. Create `ipc-setup.web.ts` with subset of handlers
2. Add aliases to tsup config
3. Create simple electron-log stub
4. Test and add handlers incrementally

**Estimated time:** 4-6 hours

---

### 🥈 #2: Frontend Web Build (Solution 6)
**Best for: Clean build separation and optimization**

```typescript
// Implementation summary:
// 1. Add vite.web-main.config.ts to frontend
// 2. Build frontend for web: npm run build:web-main
// 3. Import from dist/web-main in web-server
// 4. Stub externalized deps in web-server
```

**Why it's good:**
- Complete build-time separation
- Can use Vite's optimizations
- Pre-built bundles are reliable
- Type-safe with conditional compilation

**Trade-off:**
- Extra build step
- Slightly slower iteration (must rebuild on changes)

**Estimated time:** 6-8 hours

---

### 🥉 #3: Build-Time Defines (Solution 1)
**Best for: Quick solution with minimal setup**

```typescript
// Implementation summary:
// 1. Add defines to tsup.config.ts
// 2. Stub electron-log and electron-updater
// 3. Test all handlers work
```

**Why it's viable:**
- Fastest to implement (2-3 hours)
- Zero code changes
- Simple configuration

**Risk:**
- Need to verify stubbed modules aren't actually used
- String-based replacement can be brittle
- Harder to debug what was replaced

**Estimated time:** 2-3 hours

---

## Recommendation

**Start with Solution #3 (Separate Entry Point)** because:

1. **Zero Electron code changes** - Maintains perfect upstream compatibility
2. **Explicit and maintainable** - Clear what's included vs excluded
3. **Gradual migration** - Can add handlers one by one
4. **Low risk** - Easy to test and verify
5. **Scales well** - Clean pattern for future additions

**Fallback plan:** If Solution #3 reveals issues with handler dependencies, upgrade to Solution #6 (Frontend Web Build) for stronger isolation.

**Quick win:** Can implement Solution #1 (Build-Time Defines) first as a proof-of-concept, then migrate to Solution #3 for production.
