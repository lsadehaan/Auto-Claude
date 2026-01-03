# Auto-Claude Web Server

Web server implementation of Auto-Claude using [electron-to-web](https://github.com/neohed/electron-to-web) to run Electron IPC handlers over WebSocket.

## Architecture

This server enables Auto-Claude's Electron desktop app to run as a web application by:

1. **Module Aliasing**: Redirects `electron` imports to `electron-to-web/main`
2. **IPC over WebSocket**: Replaces Electron's IPC with JSON-RPC over WebSocket
3. **Web-Compatible Handlers**: Uses `ipc-setup.web.ts` which excludes Electron-only handlers
4. **Runtime Stubs**: Provides minimal implementations for externalized Electron packages

## Setup

### Installation

```bash
# From project root
npm install

# Or from web-server directory
cd apps/web-server
npm install
```

### Create Runtime Stubs

After installation, create stub packages for externalized dependencies:

```bash
npm run create-stubs
```

This creates stub packages in `node_modules/` for:
- **electron-log** - Console-based logger
- **electron-updater** - Auto-update stub (no-op in web context)
- **@lydell/node-pty** - Terminal emulation stub (throws error)

**Note**: Stubs are created automatically via `postinstall` hook, but you can run manually if needed.

## Development

### Start Development Server

```bash
npm run dev
```

Server starts on `http://localhost:3001` with:
- **IPC Endpoint**: `ws://localhost:3001/ipc`
- **Hot Reload**: Uses tsx watch mode

### Build for Production

```bash
npm run build
```

Creates optimized bundle in `dist/` directory:
- Format: ESM
- Platform: Node.js
- Bundle Size: ~1.64 MB
- Source Maps: Yes

### Run Production Build

```bash
npm run build
npm start
```

## Configuration

### Environment Variables

Create `.env` file (see `.env.example`):

```env
# Server configuration
PORT=3001
HOST=0.0.0.0

# Backend configuration (optional)
BACKEND_DIR=../backend
PYTHON_CMD=python
```

### Port Configuration

Default port is 3001. To change:

```bash
PORT=8080 npm start
```

## Externalized Packages

These packages are **not bundled** and require runtime stubs:

| Package | Reason | Stub Behavior |
|---------|--------|---------------|
| `electron-log` | Requires Electron runtime | Console-based logger |
| `electron-updater` | Uses Electron auto-updater | No-op methods |
| `@lydell/node-pty` | Native terminal module | Throws error |

## IPC Handlers

The web server registers ~100+ IPC handlers from:

**Included** (via `ipc-setup.web.ts`):
- ✅ Project handlers
- ✅ Task handlers
- ✅ Terminal handlers
- ✅ Agent event handlers
- ✅ Settings handlers
- ✅ File handlers
- ✅ Roadmap handlers
- ✅ Context handlers
- ✅ Environment handlers
- ✅ Linear integration
- ✅ GitHub integration
- ✅ GitLab integration
- ✅ Autobuild sources
- ✅ Ideation handlers
- ✅ Changelog handlers
- ✅ Insights handlers
- ✅ Memory handlers
- ✅ Debug handlers
- ✅ Claude Code CLI
- ✅ MCP handlers

**Excluded**:
- ❌ App update handlers (uses `electron-updater`)

## Deployment

### Production Server

Current deployment: `https://claude.praiaradical.com`

Deploy steps:
1. Build the server: `npm run build`
2. Copy `dist/` to server
3. Copy `node_modules/` (with stubs) to server
4. Copy `.env` configuration
5. Start with process manager (PM2, systemd, etc.)

### Health Checks

```bash
# Check server health
curl http://localhost:3001/api/health

# Check IPC endpoint
wscat -c ws://localhost:3001/ipc
```

## Troubleshooting

### Stubs Not Found

If you see errors about missing packages:

```bash
# Recreate stubs
npm run create-stubs

# Verify stubs exist
ls -la node_modules/electron-log/
ls -la node_modules/electron-updater/
ls -la node_modules/@lydell/node-pty/
```

### Module Resolution Errors

If imports fail:

1. Check `package.json` has `"type": "module"`
2. Verify stub packages have proper `package.json` with `"type": "module"`
3. Check stub files use ESM syntax (export/import)

### Build Errors

If bundling fails:

1. Ensure all externalized packages are in `tsup.config.ts` external list
2. Check stub creation script matches externalized packages
3. Verify electron alias is configured in esbuildOptions

## Project Structure

```
apps/web-server/
├── src/
│   ├── index.ts           # Server entry point
│   └── stubs/
│       └── electron-log.ts # Bundled stub (not used, kept for reference)
├── scripts/
│   └── create-stubs.js    # Runtime stub creator
├── dist/                  # Build output (gitignored)
├── node_modules/          # Dependencies + runtime stubs (gitignored)
├── tsup.config.ts         # Build configuration
├── package.json           # Dependencies and scripts
├── .env                   # Environment config (gitignored)
└── README.md              # This file
```

## Related Documentation

- [electron-to-web](https://github.com/neohed/electron-to-web) - Electron to web compatibility layer
- [MIGRATION_SUCCESS_SUMMARY.md](../../MIGRATION_SUCCESS_SUMMARY.md) - Migration guide
- [RUNTIME_SOLUTIONS_ANALYSIS.md](../../RUNTIME_SOLUTIONS_ANALYSIS.md) - Technical analysis

## Contributing

When adding new Electron-specific dependencies:

1. Add to `external` list in `tsup.config.ts`
2. Create stub in `scripts/create-stubs.js`
3. Document in this README
4. Test with `npm run create-stubs && npm run build && npm start`
