@echo off
cd /d "%~dp0"
echo Starting OneTrainerWeb Development Environment...
echo.

REM Kill any stale backend from a previous session on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo Killing stale process on port 8000 (PID %%a)...
    taskkill /PID %%a /T /F >nul 2>&1
)

REM Verify venv
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found at venv\
    echo Run install.bat first to create the virtual environment.
    echo.
    pause
    exit /b 1
)

REM Verify node_modules
if not exist "web\gui\node_modules" (
    echo ERROR: Node modules not found at web\gui\node_modules
    echo Run: cd web\gui ^&^& npm install
    echo.
    pause
    exit /b 1
)

REM Build Electron main process
echo Compiling Electron main process...
cd web\gui
call npx tsc -p tsconfig.main.json
if errorlevel 1 (
    echo ERROR: Failed to compile Electron main process
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

REM Start Backend in its own window
echo [1/2] Starting Backend (FastAPI on port 8000)...
start "OT Backend" cmd /k "cd /d "%~dp0" && call venv\Scripts\activate && set PYTHONUNBUFFERED=1 && python -m uvicorn web.backend.main:app --host 127.0.0.1 --port 8000 --log-level info"

REM Wait for backend to begin initialization
timeout /t 3 /nobreak >nul

REM Start Vite + Electron in its own window
echo [2/2] Starting Electron + Vite...
start "OT Electron" cmd /k "cd /d "%~dp0web\gui" && set OT_EXTERNAL_BACKEND=1 && npm run dev:electron"

echo.
echo ========================================
echo OneTrainerWeb is launching!
echo ========================================
echo Backend:   http://localhost:8000/docs
echo Frontend:  http://localhost:5173 (Vite)
echo Electron:  Loading from Vite dev server
echo ========================================
echo.
echo Press any key to stop all servers...
pause >nul

REM Cleanup
echo Stopping servers...
taskkill /FI "WindowTitle eq OT Backend*" /T /F >nul 2>&1
taskkill /FI "WindowTitle eq OT Electron*" /T /F >nul 2>&1
echo Done.
