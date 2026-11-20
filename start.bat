@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tidak ditemukan. Pasang Node.js 18+ dari https://nodejs.org lalu jalankan lagi.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:8000/api/health | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Server sudah berjalan di http://localhost:8000
  start "" http://localhost:8000
  timeout /t 2 >nul
  exit /b 0
)

echo Menjalankan Kantor Isometrik di http://localhost:8000 ...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://localhost:8000'"
node server.mjs
if errorlevel 1 (
  echo.
  echo Server berhenti. Periksa server.err.log untuk detail.
  pause
)
