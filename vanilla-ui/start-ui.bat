@echo off
title CC-Link PLC Monitor - Vanilla UI
echo ============================================
echo   CC-Link PLC Monitor - Vanilla Edition
echo ============================================
echo.
echo Starting local HTTP server on port 8080...
echo Open browser: http://localhost:8080
echo Press Ctrl+C to stop.
echo.
python -m http.server 8080
pause
