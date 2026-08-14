@echo off
chcp 65001 > nul
title [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트

echo ===================================================================
echo   🌟 [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트 (Port: 5000)
echo ===================================================================
echo.

:: 1. 파이썬 설치 확인
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [경고] 파이썬(Python)이 설치되어 있지 않거나 환경변수 PATH에 등록되지 않았습니다.
    echo https://www.python.org/downloads/ 에서 Python 3.9 이상을 설치하고
    echo 설치 시 반드시 "Add python.exe to PATH" 를 체크해주세요.
    echo.
    pause
    exit /b
)

echo [1/3] 파이썬 환경 확인 완료.
echo [2/3] 필수 패키지(Flask, Playwright) 및 크롬 브라우저 점검 중...
echo.

:: 2. api_server.py 실행 (스크립트 내부에서 패키지 및 브라우저 자동 점검)
echo [3/3] 크롤링 API 서버를 구동합니다...
echo -------------------------------------------------------------------
echo  * 로컬 API 주소: http://127.0.0.1:5000
echo  * 상태: Cloudflare 배포 웹사이트(https://lua-visibility.pages.dev)
echo          및 로컬 웹앱과 실시간 연동 대기 중...
echo  * (본 터미널 창을 닫지 말고 최소화하여 유지해주세요.)
echo -------------------------------------------------------------------
echo.

python src/services/api_server.py

if %errorlevel% neq 0 (
    echo.
    echo [오류] 크롤러 서버가 예기치 않게 종료되었습니다.
    pause
)
