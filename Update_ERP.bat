@echo off
title AdGen Pharmacy ERP - Updating App from GitHub...
echo ========================================================
echo       🔄 Downloading Latest Updates from GitHub 🔄
echo ========================================================
echo.

cd /d %~dp0

echo [1/3] Pulling latest code changes from GitHub...
git pull origin main

echo.
echo [2/3] Updating backend dependencies and database migrations...
cd backend
call npm install
call npx prisma migrate deploy
cd ..

echo.
echo [3/3] Updating frontend packages...
cd client
call npm install
cd ..

echo.
echo ========================================================
echo  ✅ AdGen Pharmacy ERP updated successfully!
echo  Double-click "Start_ERP.bat" to launch the updated app.
echo ========================================================
pause
