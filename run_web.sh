#!/usr/bin/env bash
# Starts backend + Vite + Electron in a single terminal via concurrently.

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

echo ""
echo "Starting all services..."
echo ""
echo "  Backend:   http://localhost:$PORT  (FastAPI)"
echo "  Frontend:  http://localhost:5173  (Vite dev server)"
echo "  Electron:  Launches after Vite is ready"
echo ""

# Run all services via concurrently
export OT_EXTERNAL_BACKEND=1
export PYTHONUNBUFFERED=1
npx concurrently -k --names "backend,vite,electron" \
  -c "yellow,cyan,green" \
  "cd '$SCRIPT_DIR' && source '$VENV_ACTIVATE' && python -m uvicorn web.backend.main:app --host 127.0.0.1 --port $PORT --log-level info" \
  "npx vite" \
  "npx wait-on http://localhost:5173 && npx wait-on http://localhost:$PORT/api/health && npx electron ."
