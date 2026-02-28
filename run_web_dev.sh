#!/usr/bin/env bash
# Starts backend and Electron+Vite as background processes.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
VENV_ACTIVATE="$VENV_DIR/bin/activate"
GUI_DIR="$SCRIPT_DIR/web/gui"
PORT=8000

# Kill stale backend
if command -v fuser &>/dev/null; then
    fuser -k "$PORT/tcp" 2>/dev/null || true
elif command -v lsof &>/dev/null; then
    lsof -ti :"$PORT" | xargs kill 2>/dev/null || true
fi

# Verify venv
if [ ! -f "$VENV_ACTIVATE" ]; then
    echo "ERROR: Virtual environment not found at $VENV_DIR"
    echo "Run install.sh first to create the virtual environment."
    exit 1
fi

# Verify node_modules
if [ ! -d "$GUI_DIR/node_modules" ]; then
    echo "ERROR: Node modules not found at $GUI_DIR/node_modules"
    echo "Run: cd $GUI_DIR && npm install"
    exit 1
fi

# Activate venv
source "$VENV_ACTIVATE"

# Build Electron main process
echo "Compiling Electron main process..."
cd "$GUI_DIR"
npx tsc -p tsconfig.main.json

# Start backend in background
echo "[1/2] Starting backend on port $PORT..."
cd "$SCRIPT_DIR"
python -m uvicorn web.backend.main:app --host 127.0.0.1 --port "$PORT" --log-level info &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
        echo "Backend is ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "ERROR: Backend failed to start within 30 seconds"
        kill "$BACKEND_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Start Electron + Vite in background
echo "[2/2] Starting Electron + Vite..."
cd "$GUI_DIR"
export OT_EXTERNAL_BACKEND=1
npm run dev:electron &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "OneTrainerWeb is launching!"
echo "========================================"
echo "Backend:   http://localhost:$PORT/docs"
echo "Frontend:  http://localhost:5173 (Vite)"
echo "Electron:  Loading from Vite dev server"
echo "========================================"
echo ""

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill "$FRONTEND_PID" 2>/dev/null || true
    kill "$BACKEND_PID" 2>/dev/null || true
    if command -v fuser &>/dev/null; then
        fuser -k "$PORT/tcp" 2>/dev/null || true
    elif command -v lsof &>/dev/null; then
        lsof -ti :"$PORT" | xargs kill 2>/dev/null || true
    fi
    echo "Done."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for any child to exit
wait
