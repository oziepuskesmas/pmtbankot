@echo off
title Auto-Sync PMT Bankot ke GitHub
echo ===================================================
echo   Memulai Pemantau Otomatis (Auto Sync ke GitHub)
echo   Source: G:\My Drive\APLIKASI PMT
echo   Target: G:\My Drive\GitHub\pmtbankot
echo ===================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-sync-push.ps1"
pause
