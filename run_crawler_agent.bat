@echo off
setlocal
chcp 65001 > nul
title [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트

echo ===================================================================
echo   🌟 [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트 (Port: 5000)
echo ===================================================================
echo.

:: 1. 작업 디렉토리 설정 (C:\lua_crawler)
set "TARGET_DIR=C:\lua_crawler"
if not exist "%TARGET_DIR%" (
    echo [1/4] 크롤러 전용 디렉토리(%TARGET_DIR%) 생성 중...
    mkdir "%TARGET_DIR%" > nul 2>&1
)

:: 2. 파이썬 설치 확인 및 부재 시 자동 설치
set "PY_CMD=python"
%PY_CMD% --version > nul 2>&1
if errorlevel 1 (
    py --version > nul 2>&1
    if not errorlevel 1 (
        set "PY_CMD=py"
    ) else (
        echo [2/4] 파이썬이 설치되어 있지 않습니다.
        echo       Python 3.11 자동 다운로드 및 설치를 시작합니다 (약 30초 소요)...
        powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe', \"$env:TEMP\python_installer.exe\")"
        echo       파이썬 설치를 진행합니다. 잠시만 기다려주세요...
        start /wait "" "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;C:\Program Files\Python311;C:\Program Files\Python311\Scripts;%PATH%"
    )
)

echo [2/4] 파이썬 환경 확인 완료 (%PY_CMD%)

:: 3. 최신 크롤링 엔진 파일(api_server.py) 동기화
echo [3/4] 최신 크롤링 엔진(api_server.py)을 다운로드 및 점검합니다...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/yujinit2005-png/lua_visibility/main/src/services/api_server.py', 'C:\lua_crawler\api_server.py') } catch { exit 1 }" > nul 2>&1

if not exist "%TARGET_DIR%\api_server.py" (
    if exist "%~dp0src\services\api_server.py" (
        copy /Y "%~dp0src\services\api_server.py" "%TARGET_DIR%\api_server.py" > nul 2>&1
    )
)

:: 4. 서버 구동
echo [4/4] 루비스 로컬 크롤링 API 서버를 구동합니다...
echo -------------------------------------------------------------------
echo  * 실행 파일: %TARGET_DIR%\api_server.py
echo  * 로컬 API 주소: http://127.0.0.1:5000 (Port 5000)
echo  * 상태: Cloudflare 배포 웹사이트(https://lua-visibility.pages.dev)
echo          및 로컬 웹앱과 실시간 연동 대기 중...
echo  * (본 창을 닫지 마시고 최소화하여 유지해주세요.)
echo -------------------------------------------------------------------
echo.

cd /d "%TARGET_DIR%"
%PY_CMD% api_server.py

echo.
echo ===================================================================
echo   [안내] 크롤러 서버가 종료되었습니다.
echo ===================================================================
pause
