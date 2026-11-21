@echo off
title Deploy PMT Bankot ke Cloudflare
color 0A
echo ========================================================
echo    DEPLOY PEMBARUAN PMT BANKOT KE CLOUDFLARE
echo ========================================================
echo.
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%PATH%

echo Menjalankan: npx wrangler deploy
echo.
call npx wrangler deploy

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo    BERHASIL! Deploy ke Cloudflare Sukses!
    echo ========================================================
    echo.
) else (
    echo.
    echo ========================================================
    echo    DEPLOY MENGALAMI KENDALA
    echo ========================================================
    echo.
)

pause
