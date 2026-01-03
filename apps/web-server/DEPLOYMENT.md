# Web Server Deployment Guide

Quick guide for deploying the Auto-Claude web server to production.

## Prerequisites

- Node.js 18+ installed on server
- Git access to repository
- Python 3.10+ (for backend)
- Process manager (PM2, systemd, etc.)

## Deployment Steps

### 1. Clone Repository

```bash
git clone https://github.com/your-org/Auto-Claude.git
cd Auto-Claude
git checkout feat/electron-to-web-migration
```

### 2. Install Dependencies

```bash
# Install all dependencies (this runs postinstall hook)
npm install

# Or install web-server only
cd apps/web-server
npm install
```

The `postinstall` hook automatically creates runtime stubs for:
- electron-log
- electron-updater
- @lydell/node-pty

### 3. Configure Environment

```bash
cd apps/web-server

# Create .env file
cat > .env <<EOF
PORT=3001
HOST=0.0.0.0
BACKEND_DIR=../backend
PYTHON_CMD=python
EOF
```

### 4. Build Server

```bash
npm run build
```

Expected output:
- Bundle: ~1.64 MB
- Format: ESM
- Platform: Node.js

### 5. Verify Stubs Exist

```bash
# Check stub packages were created
ls -la node_modules/electron-log/package.json
ls -la node_modules/electron-updater/package.json
ls -la node_modules/@lydell/node-pty/package.json

# Should all exist with version 999.0.0-stub
```

### 6. Test Server Locally

```bash
# Start server
npm start

# In another terminal, verify health
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-03T..."
}
```

### 7. Deploy with Process Manager

#### Option A: PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start server
pm2 start dist/index.js --name auto-claude-web

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup
```

#### Option B: systemd

```bash
# Create service file
sudo cat > /etc/systemd/system/auto-claude-web.service <<EOF
[Unit]
Description=Auto-Claude Web Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/auto-claude/apps/web-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable auto-claude-web
sudo systemctl start auto-claude-web

# Check status
sudo systemctl status auto-claude-web
```

### 8. Configure Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name claude.praiaradical.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # HTTP traffic
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket IPC endpoint
    location /ipc {
        proxy_pass http://localhost:3001/ipc;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## Verification Checklist

After deployment, verify:

- [ ] Server responds to HTTP requests: `curl https://claude.praiaradical.com/api/health`
- [ ] WebSocket endpoint is accessible: `wscat -c wss://claude.praiaradical.com/ipc`
- [ ] All IPC handlers registered (check logs for "~100+ handlers" message)
- [ ] No module resolution errors in logs
- [ ] Stubs are functioning (electron-log outputs to console)

## Troubleshooting

### Stubs Not Found

```bash
# Manually recreate stubs
cd apps/web-server
npm run create-stubs
```

### Module Resolution Errors

```bash
# Check stub package.json files have "type": "module"
cat node_modules/electron-log/package.json | grep type
cat node_modules/electron-updater/package.json | grep type
cat node_modules/@lydell/node-pty/package.json | grep type
```

### Server Won't Start

```bash
# Check build output exists
ls -la dist/index.js

# Check environment variables
cat .env

# Check logs
tail -f /var/log/auto-claude-web.log  # or PM2 logs
pm2 logs auto-claude-web
```

### Backend Connection Issues

```bash
# Verify backend Python environment
cd ../backend
python run.py --help

# Check backend .env
cat .env | grep CLAUDE_CODE_OAUTH_TOKEN
```

## Updating Deployment

```bash
# Stop server
pm2 stop auto-claude-web  # or sudo systemctl stop auto-claude-web

# Pull latest changes
git pull origin feat/electron-to-web-migration

# Reinstall dependencies (runs postinstall)
npm install

# Rebuild
npm run build

# Start server
pm2 start auto-claude-web  # or sudo systemctl start auto-claude-web
```

## Rollback

```bash
# Stop server
pm2 stop auto-claude-web

# Checkout previous commit
git checkout <previous-commit-hash>

# Reinstall and rebuild
npm install
npm run build

# Start server
pm2 start auto-claude-web
```

## Monitoring

### Check Server Health

```bash
# HTTP health check
curl -s https://claude.praiaradical.com/api/health | jq

# WebSocket test
wscat -c wss://claude.praiaradical.com/ipc
```

### View Logs

```bash
# PM2 logs
pm2 logs auto-claude-web

# systemd logs
sudo journalctl -u auto-claude-web -f

# Application logs (if configured)
tail -f /var/log/auto-claude-web.log
```

### Resource Usage

```bash
# PM2 monitoring
pm2 monit

# System resources
htop
```

## Production Checklist

- [ ] Environment variables configured (PORT, HOST, etc.)
- [ ] Process manager configured for auto-restart
- [ ] Reverse proxy (Nginx) configured for HTTPS
- [ ] SSL certificates installed and valid
- [ ] Firewall rules allow port 3001 (or configured port)
- [ ] Log rotation configured
- [ ] Monitoring and alerting set up
- [ ] Backup strategy in place
- [ ] Update procedure documented

## Security Considerations

1. **Firewall**: Only expose port 443 (HTTPS), keep 3001 internal
2. **HTTPS**: Always use SSL/TLS in production
3. **Environment**: Never commit `.env` files
4. **Updates**: Keep Node.js and dependencies updated
5. **Access**: Limit server access to authorized personnel only

## Performance Tuning

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Enable cluster mode (PM2)
pm2 start dist/index.js -i max --name auto-claude-web
```

## Support

For issues or questions:
- Check logs first
- Review troubleshooting section
- Check GitHub issues
- Contact development team
