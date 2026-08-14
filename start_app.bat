@echo off
chcp 65001 > nul
title 루비스 (LUVIS) 웹 애플리케이션 실행기

echo ========================================================
echo   루비스 (LUVIS) AI 가시성 진단 시스템 단독창 실행
echo ========================================================
echo.

:: 1. 파이썬 웹 실측 크롤링 API 서버(Port 5000) 백그라운드 시작
echo [1/3] 웹 실측 크롤링 API 서버를 실행합니다...
start /B python src/services/api_server.py

:: 2. Vite 개발 서버 백그라운드 시작
echo [2/3] 로컬 개발 서버(Vite)를 실행합니다...
start /B npm run dev

:: 3. 서버가 뜰 때까지 잠시 대기
timeout /t 2 /nobreak > nul

:: 4. 크롬 또는 엣지 브라우저를 전용 단독 앱 모드(--app)로 실행
echo [3/3] 루비스 단독창 모드로 브라우저를 실행합니다...

:: 크롬 경로 확인 및 실행
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
    goto done
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
    goto done
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
    goto done
)

:: 엣지 브라우저 경로 확인 및 실행
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173
    goto done
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173
    goto done
)

:: 기본 브라우저 실행 fallback
start http://localhost:5173

:done
echo.
echo ========================================================
echo   루비스 단독창이 성공적으로 실행되었습니다!
echo   (초기 관리자 계정: luaadmin / lua123!@#)
echo ========================================================
