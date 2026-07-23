@echo off
title AdGen Pharmacy ERP - Starting Services...
echo ========================================================
echo         🚀 Launching AdGen Pharmacy ERP 🚀
echo ========================================================
echo.

cd /d %~dp0

echo [1/2] Starting Backend Node API Server (Port 5000)...
start /min cmd /c "cd backend && npm run dev"

echo [2/2] Starting Frontend Next.js Web App (Port 3000)...
start /min cmd /c "cd client && npm run dev"

echo.
echo Waiting 5 seconds for servers to start...
timeout /t 5 /nobreak >nul

echo.
echo Opening Pharmacy ERP Billing Counter in Web Browser...
start http://localhost:3000/billing

echo ========================================================
echo  AdGen Pharmacy ERP is running in the background!
echo  Do not close this window while operating the pharmacy.
echo ========================================================
pause
