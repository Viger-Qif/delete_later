@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

rem One-click Windows launcher:
rem - finds Python 3.13 or 3.12 (and installs 3.13 when needed);
rem - creates, validates or repairs the local virtual environment;
rem - restores pip through ensurepip/get-pip when a broken venv has no pip;
rem - installs every package from requirements.txt;
rem - creates .env from .env.example;
rem - starts the current API and opens the browser.

set "ROOT=%~dp0"
set "URL=http://127.0.0.1:8000/"
set "LOG_DIR=%ROOT%logs"
set "SETUP_LOG=%LOG_DIR%\setup.log"
set "SERVER_LOG=%LOG_DIR%\server.log"
set "VENV_DIR=%ROOT%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "NO_BROWSER=0"
if /i "%~1"=="--no-browser" set "NO_BROWSER=1"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
>"%SETUP_LOG%" echo [%date% %time%] Negotiation Lab setup started

echo.
echo ==========================================
echo       Negotiation Lab - first launch
echo ==========================================
echo.
echo Project: %ROOT%
echo Setup log: %SETUP_LOG%
echo.

call :select_python
if not defined PY_EXE goto no_python

echo [1/5] Python found: %PY_EXE% %PY_ARGS%
call :prepare_venv
if errorlevel 1 goto setup_failed

echo [3/5] Updating pip and installing all libraries...
"%VENV_PY%" -m pip install --upgrade pip setuptools wheel >>"%SETUP_LOG%" 2>&1
if errorlevel 1 goto setup_failed
"%VENV_PY%" -m pip install --upgrade -r "%ROOT%requirements.txt" >>"%SETUP_LOG%" 2>&1
if errorlevel 1 goto setup_failed

if not exist "%ROOT%.env" (
    echo [4/5] Creating local configuration from .env.example...
    if not exist "%ROOT%.env.example" goto config_failed
    copy /Y "%ROOT%.env.example" "%ROOT%.env" >>"%SETUP_LOG%" 2>&1
    if errorlevel 1 goto setup_failed
) else (
    echo [4/5] Existing .env kept unchanged.
)

rem Do not terminate an unrelated application on port 8000.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto ready

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
    echo Port 8000 is already occupied.
    echo Close the application that uses it, then run start.bat again.
    goto launch_failed
)

echo [5/5] Starting API...
set "PYTHONUTF8=1"
start "Negotiation Lab API" /min "%ComSpec%" /d /c ""%VENV_PY%" -m uvicorn app.main:app --app-dir "%ROOT%backend" --host 127.0.0.1 --port 8000 > "%SERVER_LOG%" 2>&1"

echo Waiting for the API to become ready...
for /l %%i in (1,1,60) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 goto ready
    timeout /t 1 /nobreak >nul
)

echo The API did not start. See:
echo %SERVER_LOG%
start "" notepad "%SERVER_LOG%"
goto launch_failed

:ready
echo.
echo SUCCESS: Negotiation Lab is ready at %URL%
if "%NO_BROWSER%"=="1" (
    echo Browser opening was skipped by --no-browser.
) else (
    echo Opening browser...
    start "" "%URL%?build=v21.25-fidelina-welcome"
)
echo.
echo To stop the local server, close its "Negotiation Lab API" window.
echo Setup can be run again safely; dependencies are checked by pip.
exit /b 0

:select_python
set "PY_EXE="
set "PY_ARGS="

rem Prefer the Python Launcher because it can select the required version.
where py >nul 2>nul
if not errorlevel 1 (
    py -3.13 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
    if not errorlevel 1 (
        set "PY_EXE=py"
        set "PY_ARGS=-3.13"
    )
    if not defined PY_EXE (
        py -3.12 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
        if not errorlevel 1 (
            set "PY_EXE=py"
            set "PY_ARGS=-3.12"
        )
    )
    if not defined PY_EXE (
        py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
        if not errorlevel 1 (
            set "PY_EXE=py"
            set "PY_ARGS=-3"
        )
    )
)

rem Fall back to python.exe already available on PATH.
if not defined PY_EXE (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        if not defined PY_EXE (
            "%%P" -c "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
            if not errorlevel 1 set "PY_EXE=%%P"
        )
    )
)

rem If Python is missing, try the official Windows package manager once.
if not defined PY_EXE if not defined PY_BOOTSTRAP_ATTEMPTED (
    set "PY_BOOTSTRAP_ATTEMPTED=1"
    where winget >nul 2>nul
    if not errorlevel 1 (
        echo Python 3.12 or 3.13 was not found. Installing Python 3.13 with winget...
        winget install --id Python.Python.3.13 -e --source winget --accept-source-agreements --accept-package-agreements >>"%SETUP_LOG%" 2>&1
        set "PATH=%LocalAppData%\Programs\Python\Python313;%ProgramFiles%\Python313;%PATH%"
        goto select_python
    )
)
exit /b 0

:prepare_venv
set "RECREATE_VENV=0"
if exist "%VENV_PY%" (
    "%VENV_PY%" -c "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)" >nul 2>nul
    if errorlevel 1 set "RECREATE_VENV=1"
)
if not exist "%VENV_PY%" set "RECREATE_VENV=1"

if "%RECREATE_VENV%"=="1" (
    echo [2/5] Creating a clean local Python environment...
    if exist "%VENV_DIR%" rmdir /S /Q "%VENV_DIR%" >>"%SETUP_LOG%" 2>&1
    "%PY_EXE%" %PY_ARGS% -m venv "%VENV_DIR%" >>"%SETUP_LOG%" 2>&1
    if errorlevel 1 exit /b 1
) else (
    echo [2/5] Existing local Python environment found. Checking pip...
)

if not exist "%VENV_PY%" exit /b 1
call :bootstrap_pip
if errorlevel 1 (
    echo Existing environment is damaged. Recreating it once...
    rmdir /S /Q "%VENV_DIR%" >>"%SETUP_LOG%" 2>&1
    "%PY_EXE%" %PY_ARGS% -m venv "%VENV_DIR%" >>"%SETUP_LOG%" 2>&1
    if errorlevel 1 exit /b 1
    call :bootstrap_pip
    if errorlevel 1 exit /b 1
)
exit /b 0

:bootstrap_pip
"%VENV_PY%" -m pip --version >nul 2>nul
if not errorlevel 1 exit /b 0

echo pip is missing. Trying Python ensurepip...
>>"%SETUP_LOG%" echo [%date% %time%] pip missing; running ensurepip
"%VENV_PY%" -m ensurepip --upgrade >>"%SETUP_LOG%" 2>&1
"%VENV_PY%" -m pip --version >nul 2>nul
if not errorlevel 1 exit /b 0

echo ensurepip did not restore pip. Downloading the official pip bootstrap...
set "GET_PIP=%LOG_DIR%\get-pip.py"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%GET_PIP%'; exit 0 } catch { exit 1 }" >>"%SETUP_LOG%" 2>&1
if errorlevel 1 exit /b 1
"%VENV_PY%" "%GET_PIP%" >>"%SETUP_LOG%" 2>&1
del /Q "%GET_PIP%" >nul 2>nul
"%VENV_PY%" -m pip --version >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

:no_python
echo.
echo Python 3.12 or 3.13 is required, but it was not found.
echo Install Python from https://www.python.org/downloads/ and run start.bat again.
echo The launcher attempted an automatic winget installation when it was available.
goto launch_failed

:config_failed
echo .env.example is missing from the project.
goto launch_failed

:setup_failed
echo.
echo Environment setup failed. The full installer log is:
echo %SETUP_LOG%
start "" notepad "%SETUP_LOG%"
goto launch_failed

:launch_failed
echo.
echo Launch failed. Press any key to close this window.
pause >nul
exit /b 1
