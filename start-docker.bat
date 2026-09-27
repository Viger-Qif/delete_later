@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

rem Keep the diagnostic console open when the file is launched by double-click.
if /i not "%~1"=="--run" (
  start "Negotiation Lab Docker" cmd.exe /k call "%~f0" --run
  exit /b 0
)

title Negotiation Lab - Docker
set "URL=http://127.0.0.1:8000/"
set "LOG_FILE=%SCRIPT_DIR%docker-start.log"
>"%LOG_FILE%" echo [%date% %time%] Starting Negotiation Lab Docker

echo.
echo === Negotiation Lab: Docker startup ===
echo Project: %SCRIPT_DIR%
echo Log: %LOG_FILE%
echo.

where docker >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;!PATH!"
  if defined ProgramFiles(x86) if exist "%ProgramFiles(x86)%\Docker\Docker\resources\bin\docker.exe" set "PATH=%ProgramFiles(x86)%\Docker\Docker\resources\bin;!PATH!"
)

where docker >nul 2>nul
if errorlevel 1 goto no_docker

echo Docker found:
docker --version
>>"%LOG_FILE%" 2>&1 docker --version

docker info >nul 2>>"%LOG_FILE%"
if errorlevel 1 goto engine_off

docker compose version
>>"%LOG_FILE%" 2>&1 docker compose version
if errorlevel 1 goto compose_missing

if not exist "%SCRIPT_DIR%.env" (
  echo .env not found. Creating it from .env.docker.example...
  copy /Y "%SCRIPT_DIR%.env.docker.example" "%SCRIPT_DIR%.env" >>"%LOG_FILE%" 2>&1
  echo .env created. Cloud model is optional; the offline expert will work without a key.
)

if not exist "%SCRIPT_DIR%Dockerfile" goto config_error
if not exist "%SCRIPT_DIR%docker-compose.yml" goto config_error

echo Validating compose configuration...
docker compose config >"%LOG_FILE%" 2>&1
if errorlevel 1 goto compose_config_error

echo Building and starting PostgreSQL + application...
docker compose up --build -d >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto compose_start_error

echo.
echo Containers started. Waiting for API health...
for /l %%i in (1,1,60) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 2 /nobreak >nul
)
goto health_error

:ready
echo.
echo SUCCESS: application is ready at %URL%
echo Opening browser...
start "" "%URL%"
echo.
echo Useful commands:
echo   docker compose logs -f app
echo   stop-docker.bat
echo.
echo This window is intentionally kept open. Close it when finished.
pause
exit /b 0

:no_docker
echo ERROR: docker.exe was not found.
echo Install Docker Desktop and restart it, then run this file again.
goto finish_error

:engine_off
echo ERROR: Docker Desktop engine is not running or is not reachable.
echo Start Docker Desktop, wait until it says Running, then run this file again.
goto finish_error

:compose_missing
echo ERROR: Docker Compose plugin is unavailable.
echo Update Docker Desktop and try again.
goto finish_error

:config_error
echo ERROR: Dockerfile or docker-compose.yml is missing from this folder.
goto finish_error

:compose_config_error
echo ERROR: docker-compose.yml validation failed.
type "%LOG_FILE%"
goto finish_error

:compose_start_error
echo ERROR: containers could not be started.
docker compose ps
docker compose logs --tail=120 app
goto finish_error

:health_error
echo ERROR: containers started, but API did not become ready in 120 seconds.
docker compose ps
docker compose logs --tail=120 app
goto finish_error

:finish_error
echo.
echo See diagnostic log: %LOG_FILE%
echo Press any key to close this diagnostic window.
pause
exit /b 1
