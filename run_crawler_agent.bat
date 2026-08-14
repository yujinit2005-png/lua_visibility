@echo off
setlocal
title LUVIS AI Crawler Server

echo ========================================================
echo   LUVIS AI Local Crawler Agent (Port 5000)
echo ========================================================
echo.

set "TARGET_DIR=C:\lua_crawler"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

:: 1. Python check
set "PY_CMD=python"
python --version >nul 2>&1
if %errorlevel% equ 0 goto :py_ok

py --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=py"
    goto :py_ok
)

echo [1/3] Downloading and installing Python 3.11...
powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile '$env:TEMP/py_setup.exe'"
start /wait "" "%TEMP%\py_setup.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;C:\Program Files\Python311;C:\Program Files\Python311\Scripts;%PATH%"

:py_ok
echo [1/3] Python environment: %PY_CMD%

:: 2. Download / copy api_server.py
echo [2/3] Checking api_server.py...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/yujinit2005-png/lua_visibility/main/src/services/api_server.py' -OutFile 'C:/lua_crawler/api_server.py' } catch {}"

if not exist "%TARGET_DIR%\api_server.py" (
    if exist "%~dp0src\services\api_server.py" (
        copy /Y "%~dp0src\services\api_server.py" "%TARGET_DIR%\api_server.py" >nul 2>&1
    )
)

:: 3. Run server
echo [3/3] Starting LUVIS Crawler Server...
echo --------------------------------------------------------
echo  * Server URL: http://127.0.0.1:5000
echo  * Connected with https://lua-visibility.pages.dev
echo  * Please keep this window OPEN while testing.
echo --------------------------------------------------------
echo.

cd /d "%TARGET_DIR%"
%PY_CMD% api_server.py

echo.
echo [Server stopped.]
pause
