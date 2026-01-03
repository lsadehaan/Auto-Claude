# Local Testing Guide

Complete guide for testing the Auto-Claude web version locally.

## Quick Start

```bash
# 1. Build frontend for web
cd apps/frontend
npm run build:web

# 2. Build web-server
cd ../web-server
npm run build

# 3. Start server
npm start

# 4. Open in browser
# Navigate to: http://localhost:3001
```

## Testing Checklist

### Server Startup

- [ ] Server starts without errors
- [ ] See "Server running at http://0.0.0.0:3001"
- [ ] See "IPC endpoint: ws://0.0.0.0:3001/ipc"
- [ ] See "Serving frontend from: ..." path
- [ ] See "[electron-to-web] HTTP server listening on port 3001"
- [ ] See "~100+ IPC handlers registered"

### Frontend Loading

- [ ] Browser opens to http://localhost:3001
- [ ] HTML loads without errors
- [ ] JavaScript bundle loads (~2.3 MB)
- [ ] CSS loads (~148 KB)
- [ ] No 404 errors in browser console
- [ ] No CSP violations in console

### IPC Connection

- [ ] Browser console shows "[IPCRenderer] Connecting to: ws://localhost:3001/ipc"
- [ ] Console shows "[IPCRenderer] WebSocket connected"
- [ ] No WebSocket connection errors
- [ ] No JSON-RPC errors

### Application Functionality

Test these core features in the web UI:

#### Project Management
- [ ] Add project dialog opens
- [ ] Can select project directory (uses web dialog API)
- [ ] Project appears in sidebar
- [ ] Can open project settings

#### Task Management
- [ ] Can create new task
- [ ] Task form loads correctly
- [ ] Can view task list
- [ ] Task status updates work

#### Terminal (Limited)
- [ ] Terminal tab loads
- [ ] Shows "not supported in web" message for pty operations
- [ ] No crashes when trying to create terminal

#### Settings
- [ ] Settings dialog opens
- [ ] Can view/modify settings
- [ ] Settings persist across page reload

## Development Workflow

### Frontend Development

Use Vite dev server with hot reload:

```bash
cd apps/frontend
npm run dev:web
```

This starts the frontend on http://localhost:5173 with:
- Hot module replacement (HMR)
- Proxy to web-server at localhost:3001
- Fast refresh for React components

Start the web-server separately:
```bash
cd apps/web-server
npm run dev  # or npm start
```

### Web-Server Development

```bash
cd apps/web-server
npm run dev  # Watch mode with tsx
```

This watches for changes and auto-restarts the server.

### Full Stack Development

Terminal 1 (Frontend):
```bash
cd apps/frontend
npm run dev:web
```

Terminal 2 (Web-Server):
```bash
cd apps/web-server
npm run dev
```

Open browser to http://localhost:5173 (Vite dev server)
- Frontend changes: instant HMR
- Backend changes: server auto-restarts

## Debugging

### Check Server Logs

```bash
# Server console output shows:
[IPC] Registered handler: <channel-name>
[IPCRenderer] WebSocket connected
[electron-to-web] ...
```

### Check Browser Console

```bash
# Open DevTools (F12), check Console tab for:
[IPCRenderer] Connecting to: ws://localhost:3001/ipc
[IPCRenderer] WebSocket connected
[Web] Connecting to IPC endpoint: ws://localhost:3001/ipc
```

### Check Network Tab

1. Open DevTools → Network tab
2. Look for WebSocket connection to `/ipc`
3. Should show "101 Switching Protocols"
4. Can inspect WebSocket frames for IPC messages

### Common Issues

**Port already in use:**
```bash
# Kill existing node processes
powershell -Command "Get-Process -Name node | Stop-Process -Force"

# Or change port in apps/web-server/.env
PORT=3002
```

**Frontend not loading:**
- Check frontend was built: `ls apps/frontend/dist-web/`
- Check server config: Should see "Serving frontend from: ..." in logs
- Verify path in apps/web-server/src/config.ts matches dist-web

**WebSocket not connecting:**
- Check browser console for connection errors
- Verify server shows "[electron-to-web] WebSocket server listening on /ipc"
- Check browser security (HTTPS/WSS vs HTTP/WS)
- Disable browser extensions that might block WebSocket

**IPC handlers not working:**
- Check server logs show handlers registered
- Open browser DevTools → Network → WS tab
- Watch WebSocket frames for request/response
- Check for errors in JSON-RPC messages

## Testing IPC Communication

### Manual IPC Test

Open browser console and run:

```javascript
// Test a simple IPC call
window.electronAPI.getProjects()
  .then(result => console.log('Projects:', result))
  .catch(error => console.error('IPC Error:', error));

// Test dialog
window.electronAPI.selectDirectory()
  .then(path => console.log('Selected:', path))
  .catch(error => console.error('Error:', error));
```

### Watch WebSocket Traffic

1. Open DevTools → Network → WS (WebSocket) tab
2. Click on `/ipc` connection
3. Go to "Messages" tab
4. Perform action in UI (e.g., add project)
5. See JSON-RPC request/response in messages

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "project:list",
  "params": []
}
```

Example response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "success": true,
    "data": [...]
  }
}
```

## Performance Testing

### Measure Load Time

1. Open DevTools → Performance tab
2. Start recording
3. Reload page
4. Stop recording
5. Check metrics:
   - DOMContentLoaded: < 1s
   - Load complete: < 3s
   - WebSocket connect: < 500ms

### Check Bundle Size

```bash
cd apps/frontend
npm run build:web

# Check output:
# - index.js: ~2.3 MB (can be optimized)
# - index.css: ~148 KB
# - index.html: ~1 KB
```

## Production-Like Testing

Test with production build:

```bash
# Build everything
cd apps/frontend && npm run build:web
cd ../web-server && npm run build

# Start in production mode
cd apps/web-server
NODE_ENV=production npm start
```

Differences from development:
- No HMR or dev tools
- Optimized bundles
- No CORS
- Production error handling

## Browser Compatibility

Tested browsers:
- ✅ Chrome 120+
- ✅ Edge 120+
- ✅ Firefox 121+
- ✅ Safari 17+

Features requiring modern browser:
- WebSocket API
- ES2022 JavaScript
- CSS Grid
- fetch API

## Security Testing

### CSP (Content Security Policy)

Check browser console for CSP violations:
- Should allow: self, ws:, wss:, https://fonts.googleapis.com
- Should block: inline scripts (except module)
- Should block: eval()

### WebSocket Security

For production deployment:
- Use WSS (WebSocket Secure) not WS
- Use HTTPS not HTTP
- Configure CORS properly
- Add authentication middleware

## Next Steps

After successful local testing:

1. **Optimize Bundle Size**
   - Code splitting with dynamic imports
   - Tree shaking unused code
   - Compress assets

2. **Add Authentication**
   - Implement auth middleware in web-server
   - Add login page
   - Protect IPC endpoints

3. **Deploy to Production**
   - Follow DEPLOYMENT.md guide
   - Configure reverse proxy (Nginx)
   - Set up SSL/TLS certificates
   - Enable production logging

4. **Monitor & Log**
   - Set up error tracking (Sentry)
   - Add analytics (if needed)
   - Configure structured logging

## Troubleshooting

### Server won't start

```bash
# Check if port is in use
netstat -ano | findstr :3001

# Check logs
cat /tmp/web-server.log

# Verify build
ls apps/web-server/dist/index.js
```

### Frontend shows blank page

```bash
# Check browser console for errors
# Check if files exist
ls apps/frontend/dist-web/

# Verify server is serving files
curl http://localhost:3001/
```

### IPC calls fail

```bash
# Check WebSocket connection in DevTools
# Look for connection errors
# Verify handlers are registered in server logs
# Check CORS settings if connecting from different origin
```

## Support

For issues or questions:
- Check server logs first
- Check browser console
- Review this guide's troubleshooting section
- Check GitHub issues
- Review electron-to-web documentation
