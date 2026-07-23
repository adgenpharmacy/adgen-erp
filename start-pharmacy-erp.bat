@echo off
title AdGen Pharmacy ERP Launcher
echo Starting AdGen Pharmacy ERP System...

cd /d "%~dp0backend"
start /b npm run dev

cd /d "%~dp0client"
start /b npm run dev

echo Waiting for servers to initialize...
timeout /t 5 /nobreak >nul

start http://localhost:3000

echo AdGen Pharmacy ERP is running! You can close this window.
