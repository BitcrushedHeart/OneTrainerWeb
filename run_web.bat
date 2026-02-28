@echo off
cd /d "%~dp0"
title OneTrainerWeb
echo Starting OneTrainerWeb...
echo.

REM Kill any stale backend from a previous session on port 8000
call :kill_stale_port 8000

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

REM Run everything via concurrently
echo Starting all services in one terminal...
echo.
echo   Backend:   http://localhost:8000  (FastAPI)
echo   Frontend:  http://localhost:5173  (Vite dev server)
echo   Electron:  Launches after Vite is ready
echo.

cd web\gui
set OT_EXTERNAL_BACKEND=1
set PYTHONUNBUFFERED=1
npx concurrently -k --names "backend,vite,electron" ^
  -c "yellow,cyan,green" ^
  "cd ..\..\ && call venv\Scripts\activate && python -m uvicorn web.backend.main:app --host 127.0.0.1 --port 8000 --log-level info" ^
  "npx vite" ^
  "npx wait-on http://localhost:5173 && npx wait-on http://localhost:8000/api/health && npx electron ."

cd ..\..
echo Done.
goto :eof

:kill_stale_port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%~1 " ^| findstr "LISTENING"') do (
    echo Killing stale process on port %~1 (PID %%a^)...
    taskkill /PID %%a /T /F >nul 2>&1
)
goto :eof
