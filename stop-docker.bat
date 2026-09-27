@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>nul || (echo Docker не найден.&pause&exit /b 1)
docker compose down
pause
