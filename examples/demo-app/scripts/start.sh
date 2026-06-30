#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[observer]${NC} $1"; }
success() { echo -e "${GREEN}[observer]${NC} $1"; }
warn()    { echo -e "${YELLOW}[observer]${NC} $1"; }
error()   { echo -e "${RED}[observer]${NC} $1"; exit 1; }

echo ""
echo "  ██████╗ ██████╗ ███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
echo "  ██╔═══██╗██╔══██╗██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
echo "  ██║   ██║██████╔╝███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
echo "  ██║   ██║██╔══██╗╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
echo "  ╚██████╔╝██████╔╝███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
echo "   ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
echo "  Demo Environment"
echo ""

# ─── Check prerequisites ──────────────────────────────────────────────────────
command -v node   >/dev/null 2>&1 || error "node not found. Install Node.js >= 20"
command -v pnpm   >/dev/null 2>&1 || error "pnpm not found. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || error "docker not found. Install Docker Desktop"

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then error "Node.js >= 20 required (found v$NODE_VER)"; fi
success "Prerequisites OK (node v$(node --version), pnpm $(pnpm --version))"

# ─── Build Observer OS (if not built) ─────────────────────────────────────────
if [ ! -f "$ROOT_DIR/packages/core/dist/index.js" ]; then
  info "Building Observer OS..."
  cd "$ROOT_DIR" && pnpm install && pnpm build
  success "Build complete"
else
  info "Observer OS already built (run pnpm build in repo root to rebuild)"
fi

# ─── Install demo app deps ────────────────────────────────────────────────────
cd "$DEMO_DIR"
if [ ! -d "node_modules" ]; then
  info "Installing demo app dependencies..."
  pnpm install
fi

# ─── Start Docker infra ───────────────────────────────────────────────────────
info "Starting PostgreSQL + Redis via Docker..."
docker compose up -d
info "Waiting for PostgreSQL to be ready..."
until docker exec observer-demo-postgres pg_isready -U demo -d observer_demo >/dev/null 2>&1; do
  printf '.'
  sleep 1
done
echo ""
success "PostgreSQL ready"

until docker exec observer-demo-redis redis-cli ping >/dev/null 2>&1; do
  printf '.'
  sleep 1
done
success "Redis ready"

# ─── Start Observer Daemon ────────────────────────────────────────────────────
if curl -sf http://localhost:4000/api/health >/dev/null 2>&1; then
  success "Observer daemon already running → http://localhost:4000"
  DAEMON_PID=""
else
  # Kill any stale daemon on old port 7892
  OLD_PID=$(lsof -ti :7892 2>/dev/null || true)
  if [ -n "$OLD_PID" ]; then
    warn "Killing stale daemon (pid $OLD_PID) on port 7892..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  info "Building + starting Observer daemon on port 4000..."
  cd "$ROOT_DIR"
  pnpm --filter @observer-os/daemon build >/dev/null 2>&1 || true
  pnpm --filter @observer-os/daemon start &
  DAEMON_PID=$!
  info "Waiting for daemon..."
  for i in $(seq 1 20); do
    sleep 1; printf '.'
    if curl -sf http://localhost:4000/api/health >/dev/null 2>&1; then echo ""; break; fi
  done
  echo ""
  if curl -sf http://localhost:4000/api/health >/dev/null 2>&1; then
    success "Observer daemon ready → http://localhost:4000"
  else
    warn "Daemon not responding — check apps/daemon logs"
  fi
fi

# ─── Start Explorer ───────────────────────────────────────────────────────────
info "Starting Runtime Explorer on port 5173..."
pnpm --filter @observer-os/explorer dev &
EXPLORER_PID=$!
sleep 2
success "Explorer starting → http://localhost:5173"

# ─── Run demo app with observer run ──────────────────────────────────────────
info "Starting demo app with Observer auto-instrumentation..."
cd "$DEMO_DIR"

# Build demo app first
pnpm build 2>/dev/null || true

echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │                                                         │"
echo "  │   Observer OS Demo Environment Ready                    │"
echo "  │                                                         │"
echo "  │   Demo App   →  http://localhost:3000                   │"
echo "  │   Observer   →  http://localhost:4000                   │"
echo "  │   Explorer   →  http://localhost:5173                   │"
echo "  │                                                         │"
echo "  │   Open Explorer and click buttons in the Demo App       │"
echo "  │   to see real-time runtime intelligence.                │"
echo "  │                                                         │"
echo "  │   MCP (Claude): packages/mcp-server/dist/index.js      │"
echo "  │   Chrome CDP:   --remote-debugging-port=9222            │"
echo "  │                                                         │"
echo "  │   Press Ctrl+C to stop everything                       │"
echo "  │                                                         │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""

cleanup() {
  echo ""
  info "Shutting down..."
  kill $DAEMON_PID $EXPLORER_PID 2>/dev/null || true
  cd "$DEMO_DIR" && docker compose stop
  success "Done"
}
trap cleanup EXIT INT TERM

# Run demo app — observer run handles auto-instrumentation
PGPORT=5433 OBSERVER_URL=http://localhost:4000 "$DEMO_DIR/node_modules/.bin/tsx" \
  --require "$ROOT_DIR/packages/auto-instrument/dist/index.js" \
  "$DEMO_DIR/src/index.ts"
