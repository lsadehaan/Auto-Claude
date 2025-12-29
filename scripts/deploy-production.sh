#!/bin/bash
# Production Deployment Script with Verification
# Deploy Auto-Claude updates to production server with safety checks

set -e  # Exit on any error

DEPLOY_DIR="/opt/auto-claude"
BACKEND_DIR="$DEPLOY_DIR/apps/backend"
WEB_SERVER_DIR="$DEPLOY_DIR/apps/web-server"

echo "========================================="
echo "  Auto-Claude Production Deployment"
echo "========================================="
echo ""

# Step 1: Pull latest code
echo "📥 Pulling latest code from GitHub..."
cd "$DEPLOY_DIR"
git fetch origin
git pull origin develop
echo "  ✅ Code updated"
echo ""

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install --production 2>&1 | tail -5
echo "  ✅ Dependencies installed"
echo ""

# Step 3: Run backend verification
echo "🔍 Verifying backend deployment..."
cd "$BACKEND_DIR"
bash verify-deployment.sh || {
    echo "❌ Backend verification failed!"
    echo "   Deployment aborted - server still running old code"
    exit 1
}
echo ""

# Step 4: Build frontend React app
echo "🏗️  Building frontend React app..."
cd "$DEPLOY_DIR/apps/frontend"
npx vite build --config vite.web.config.ts 2>&1 | tail -10 || {
    echo "❌ Frontend build failed!"
    exit 1
}
echo "  ✅ Frontend built"
echo ""

# Step 5: Build web server backend
echo "🏗️  Building web server backend..."
cd "$DEPLOY_DIR"
npm run web:build 2>&1 | tail -10 || {
    echo "❌ Web server build failed!"
    exit 1
}
echo "  ✅ Web server built"
echo ""

# Step 6: Restart web server
echo "🔄 Restarting web server..."
systemctl restart auto-claude-web 2>/dev/null || {
    # If systemd service doesn't exist, use manual restart
    pkill -f "tsx watch src/index.ts" || true
    sleep 2
    cd "$WEB_SERVER_DIR"
    nohup npm run dev > /tmp/auto-claude-web.log 2>&1 &
}
echo "  ✅ Server restarted"
echo ""

# Step 7: Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Step 8: Verify server is healthy
echo "🏥 Checking server health..."
curl -f http://localhost:3001/api/health > /dev/null 2>&1 || {
    echo "❌ Server health check failed!"
    echo "   Server may not be running correctly"
    exit 1
}
echo "  ✅ Server is healthy"
echo ""

# Step 9: Verify backend health
echo "🏥 Checking backend health..."
BACKEND_HEALTH=$(curl -s http://localhost:3001/api/health/backend)
if echo "$BACKEND_HEALTH" | grep -q '"healthy":true'; then
    echo "  ✅ Backend is healthy"
else
    echo "❌ Backend health check failed!"
    echo "$BACKEND_HEALTH" | python3 -m json.tool 2>/dev/null || echo "$BACKEND_HEALTH"
    exit 1
fi
echo ""

# Success!
echo "========================================="
echo "  ✅ Deployment Successful!"
echo "========================================="
echo ""
echo "Deployment completed at: $(date)"
echo "Commit: $(git rev-parse --short HEAD)"
echo ""
exit 0
