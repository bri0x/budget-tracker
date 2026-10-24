@echo off
cd /d "%~dp0"

tasklist /FI "IMAGENAME eq pocketbase.exe" 2>NUL | find /I "pocketbase.exe" >NUL
if errorlevel 1 (
    echo Starting PocketBase...
    start "" /B pocketbase.exe serve
    timeout /t 2 /nobreak >NUL
)

start "" "http://127.0.0.1:8090"
