@echo off
chcp 65001 > nul
title 루비스(LUVIS) 바탕화면 바로가기 생성기

echo ========================================================
echo   루비스 (LUVIS) 바탕화면 바로가기 아이콘 생성
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$shortcut = $ws.CreateShortcut(\"$desktop\LUVIS Visibility.lnk\"); " ^
  "$shortcut.TargetPath = 'https://lua-visibility.pages.dev'; " ^
  "$shortcut.IconLocation = \"$PSScriptRoot\public\favicon.ico,0\"; " ^
  "$shortcut.Description = '루비스 (LUVIS) AI 가시성 진단 시스템'; " ^
  "$shortcut.Save(); " ^
  "Write-Host '✅ 바탕화면에 [LUVIS Visibility] 바로가기가 성공적으로 생성되었습니다!'"

echo.
pause
