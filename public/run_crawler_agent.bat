@echo off
chcp 65001 > nul
title [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트

echo ===================================================================
echo   🌟 [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트 (Port: 5000)
echo ===================================================================
echo.

:: 1. 작업 디렉토리 설정 (C:\lua_crawler)
set "TARGET_DIR=C:\lua_crawler"
if not exist "%TARGET_DIR%" (
    echo [1/5] 크롤러 전용 디렉토리(%TARGET_DIR%)를 생성합니다...
    mkdir "%TARGET_DIR%" > nul 2>&1
)

:: 2. api_server.py 자동 추출 및 배포 (C:\lua_crawler\api_server.py)
echo [2/5] 크롤링 엔진 파일(api_server.py)을 점검 및 생성합니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$b64 = 'aW1wb3J0IG9zCmltcG9ydCBzeXMKaW1wb3J0IHN1YnByb2Nlc3MKaW1wb3J0IHRpbWUKaW1wb3J0IHVybGxpYi5wYXJzZQppbXBvcnQgcmUKaW1wb3J0IHRyYWNlYmFjaw==';" ^
  "$b64 += 'CgojIDEuIOyekOuZme2MqO2CpOyngCDshKTsuZgg66Gc7KeBIApkZWYgaW5zdGFsbF9yZXF1aXJlbWVudHMoKToKICAgIHJlcXVpcmVkX3BhY2thZ2VzID0gWydmbGFzaycsICdmbGFzay1jb3JzJywgJ3BsYXl3cmlnaHQnXQogICAgbmVlZHNfaW5zdGFsbCA9IEZhbHNlCiAgICAKICAgIGZvciBwa2cgaW4gcmVxdWlyZWRfcGFja2FnZXM6CiAgICAgICAgdHJ5OgogICAgICAgICAgICBpZiBwa2cgPT0gJ2ZsYXNrLWNvcnMnOgogICAgICAgICAgICAgICAgaW1wb3J0IGZsYXNrX2NvcnMKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIF9faW1wb3J0X18ocGtnKQogICAgICAgIGV4Y2VwdCBJbXBvcnRFcnJvcjoKICAgICAgICAgICAgbmVlZHNfaW5zdGFsbCA9IFRydWUKICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgCiAgICBpZiBuZWVkc19pbnN0YWxsOgogICAgICAgIHByaW50KCdbTFVBIEFJXc2Vs7IiYIO2MqO2CpOyngOqwgCDsubzsiqXri4jri6QuIOyekOuZme2MqO2CpOyngOulvCDsp4Ttlokg7KSRLi4uJykKICAgICAgICB0cnk6CiAgICAgICAgICAgIHN1YnByb2Nlc3MuY2hlY2tfY2FsbChbc3lzLmV4ZWN1dGFibGUsICItbSIsICJwaXAiLCAiaW5zdGFsbCJdICsgcmVxdWlyZWRfcGFja2FnZXMpCiAgICAgICAgICAgIHByaW50KCdbTFVBIEFJXSDtlKjtgrjsn4Ag7ISk7LmYIOyZhOujjC4nKQogICAgICAgICAgICBwcmludCgnW0xVQSBBSV0gUGxheXdyaWdodCDruIzrnbzsmpDsobAg67CU7J2064SI66as66W8IOyInstallation...nKQogICAgICAgICAgICBzdWJwcm9jZXNzLmNoZWNrX2NhbGwoW3N5cy5leGVjdXRhYmxlLCAiLW0iLCAicGxheXdyaWdodCIsICJpbnN0YWxsIiwgImNocm9taXVtIl0pCiAgICAgICAgICAgIHByaW50KCdbTFVBIEFJXSDruIzrnbzsmpDsobAg7ISk7LmYIOyZhOujjC4nKQogICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgcHJpbnQoZidbTFVBIEFJXSDtlKjtgrjsn4Ag7ISk7LmYIOykkSDsubDrpaAg67Cc7IOdOiB7ZX0nKQoKaW5zdGFsbF9yZXF1aXJlbWVudHMoKQo=';" ^
  "$b64 += 'ZnJvbSBmbGFzayBpbXBvcnQgRmxhc2ssIHJlcXVlc3QsIGpzb25pZnksIG1ha2VfcmVzcG9uc2UKZnJvbSBmbGFza19jb3JzIGltcG9ydCBDT1JTCmZyb20gcGxheXdyaWdodC5zeW5jX2FwaSBpbXBvcnQgc3luY19wbGF5d3JpZ2h0CgphcHAgPSBGbGFzayhfX25hbWVfXykKQ09SUyhhcHAsIHJlc291cmNlcz17ciIvKiI6IHsib3JpZ2lucyI6ICIqIn19LCBzdXBwb3J0c19jcmVkZW50aWFscz1UcnVlKQoKQGFwcC5iZWZvcmVfcmVxdWVzdApkZWYgaGFuZGxlX29wdGlvbnMoKToKICAgIGlmIHJlcXVlc3QubWV0aG9kID09ICdPUFRJT05TJzoKICAgICAgICByZXMgPSBtYWtlX3Jlc3BvbnNlKCkKICAgICAgICByZXMuaGVhZGVyc1siQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luIl0gPSAiKiIKICAgICAgICByZXMuaGVhZGVyc1siQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyJdID0gIioiCiAgICAgICAgcmVzLmhlYWRlcnNbIkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMiXSA9ICJHRVQsIFBPU1QsIE9QVElPTlMsIFBVVCwgREVMRVRFIgogICAgICAgIHJlcy5oZWFkZXJzWyJBY2Nlc3MtQ29udHJvbC1BbGxvdy1Qcml2YXRlLU5ldHdvcmsiXSA9ICJ0cnVlIgogICAgICAgIHJldHVybiByZXMsIDIwMAoKQGFwcC5hZnRlcl9yZXF1ZXN0CmRlZiBhZGRfY29yc19oZWFkZXJzKHJlc3BvbnNlKToKICAgIHJlc3BvbnNlLmhlYWRlcnNbIkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbiJdID0gIioiCiAgICByZXNwb25zZS5oZWFkZXJzWyJBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzIl0gPSAiR0VULCBQT1NULCBPUFRJT05TLCBQVVQsIERFTEVURSIKICAgIHJlc3BvbnNlLmhlYWRlcnNbIkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMiXSA9ICIqIgogICAgcmVzcG9uc2UuaGVhZGVyc1siQWNjZXNzLUNvbnRyb2wtQWxsb3ctUHJpdmF0ZS1OZXR3b3JrIl0gPSAidHJ1ZSIKICAgIHJldHVybiByZXNwb25zZQo=';" ^
  "$b64 += 'UExBVEZPUk1fVVJMX1RFTVBMQVRFUyA9IHsKICAgICJjaGF0Z3B0IjogImh0dHBzOi8vY2hhdGdwdC5jb20vP3E9e3F1ZXJ5fSIsCiAgICAiZ2VtaW5pIjogImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwIiwKICAgICJnb29nbGUgZ2VtaW5pIjogImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwIiwKICAgICJnb29nbGUiOiAiaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS9zZWFyY2g/cT17cXVlcnl9IiwKICAgICJwZXJwbGV4aXR5IjogImh0dHBzOi8vd3d3LnBlcnBsZXhpdHkuYWkvc2VhcmNoP3E9e3F1ZXJ5fSIsCiAgICAibmF2ZXIiOiAiaHR0cHM6Ly9zZWFyY2gubmF2ZXIuY29tL3NlYXJjaC5uYXZlcj9xdWVyeT17cXVlcnl9IiwKICAgICJjbGF1ZGUiOiAiaHR0cHM6Ly9jbGF1ZGUuYWkvbmV3IiwKfQoKYWN0aXZlX2Jyb3dzZXJzID0gc2V0KCkKc3RvcF9yZXF1ZXN0ZWQgPSBGYWxzZQp3aW5kb3dfb2Zmc2V0X2NvdW50ZXIgPSAwCgpAYXBwLnJvdXRlKCcvYXBpL2hlYWx0aCcsIG1ldGhvZHM9WydHRVQnLCAnT1BUSU9OUyddKQpkZWYgaGVhbHRoX2NoZWNrKCk6CiAgICByZXR1cm4ganNvbmlmeSh7InN0YXR1cyI6ICJvayIsICJtZXNzYWdlIjogIkxVVklTIExvY2FsIENyYXdsZXIgU2VydmVyIGlzIHJ1bm5pbmciLCAidGltZSI6IHRpbWUudGltZSgpfSkKCkBhcHAucm91dGUoJy9hcGkvY2xvc2VfYWxsJywgbWV0aG9kcz1bJ1BPU1QnLCAnR0VUJywgJ09QVElPTlMnXSkKZGVmIGNsb3NlX2FsbF9icm93c2VycygpOgogICAgZ2xvYmFsIGFjdGl2ZV9icm93c2Vycywgc3RvcF9yZXF1ZXN0ZWQKICAgIHN0b3BfcmVxdWVzdGVkID0gVHJ1ZQogICAgY2xvc2VkX2NvdW50ID0gMAogICAgcHJpbnQoIlxuW0xVQSBBSV0g7KCE7L20IOuCtOyepSDssL0g7J286rKwIOuLq+q4sCDrqI8g7YGs66Gk66eBIOyjkeyLqCDrequest\")\n    for b in list(active_browsers):\n        try:\n            b.close()\n            closed_count += 1\n        except Exception:\n            pass\n    active_browsers.clear()\n    print(f\"[LUA AI] {closed_count}개 브라우저 창 닫기 완료.\")\n    time.sleep(0.3)\n    stop_requested = False\n    return jsonify({\"success\": True, \"message\": f\"{closed_count}개 브라우저가 닫혔습니다.\"})';" ^
  "$b64 += 'def inject_and_submit_query(page, plat_key: str, query: str):\n    try:\n        if \"gemini\" in plat_key:\n            selectors = [\"div[contenteditable='true']\", \"rich-textarea div[contenteditable='true']\", \"div[role='textbox']\", \"textarea\"]\n            for sel in selectors:\n                try:\n                    elem = page.wait_for_selector(sel, timeout=2500)\n                    if elem and elem.is_visible():\n                        elem.click()\n                        time.sleep(0.2)\n                        page.keyboard.type(query, delay=10)\n                        time.sleep(0.3)\n                        page.keyboard.press(\"Enter\")\n                        return\n                except Exception: pass\n            page.mouse.click(500, 400)\n            page.keyboard.type(query, delay=10)\n            page.keyboard.press(\"Enter\")\n        elif \"claude\" in plat_key:\n            elem = page.wait_for_selector(\"div[contenteditable='true']\", timeout=3000)\n            if elem:\n                elem.click()\n                page.keyboard.type(query, delay=10)\n                page.keyboard.press(\"Enter\")\n    except Exception as e:\n        print(f\"[LUA AI] 입력 오류: {e}\")';" ^
  "$b64 += 'def extract_clean_ai_response(page, platform: str) -> str:\n    plat_key = platform.lower()\n    selectors = []\n    if \"chatgpt\" in plat_key: selectors = [\"div[data-message-author-role='assistant']\", \"main article:last-of-type .markdown\", \"article\"]\n    elif \"gemini\" in plat_key: selectors = [\".response-container-content\", \"message-content:last-of-type\", \"message-content\", \".model-response-text\"]\n    elif \"perplexity\" in plat_key: selectors = [\"div[data-testid='search-response']:last-of-type\", \".prose\", \".answer-content\"]\n    elif \"naver\" in plat_key: selectors = [\".api_txt_lines\", \".total_wrap\", \"#main_pack\"]\n    elif \"claude\" in plat_key: selectors = [\".font-claude-message\", \"div[data-is-streaming='false']\", \".prose\"]\n    raw_text = \"\"\n    for sel in selectors:\n        try:\n            elems = page.query_selector_all(sel)\n            if elems:\n                texts = [e.inner_text().strip() for e in elems if e.inner_text().strip()]\n                if texts:\n                    raw_text = texts[-1] if len(texts[-1]) > 20 else \"\\n\\n\".join(texts)\n                    break\n        except Exception: pass\n    if not raw_text or len(raw_text) < 10:\n        try:\n            main_elem = page.query_selector(\"main\")\n            raw_text = main_elem.inner_text() if main_elem else page.evaluate(\"() => document.body.innerText\") or \"\"\n        except Exception: raw_text = \"\"\n    return raw_text.strip()';" ^
  "$b64 += 'import urllib.parse\n@app.route(\"/api/verify\", methods=[\"POST\"])\ndef verify_platform():\n    global window_offset_counter, active_browsers, stop_requested\n    if stop_requested: return jsonify({\"error\": \"Stopped by user\", \"raw_text\": \"\"}), 400\n    data = request.json or {}\n    platform = data.get(\"platform\", \"ChatGPT\")\n    query = data.get(\"query\", \"\")\n    if not query: return jsonify({\"error\": \"Query is required\", \"raw_text\": \"\"}), 400\n    plat_key = platform.lower()\n    tpl = PLATFORM_URL_TEMPLATES.get(plat_key, \"https://chatgpt.com/?q={query}\")\n    url = tpl.format(query=urllib.parse.quote(query))\n    print(f\"\\n[LUA AI] 크롤링 시작: {platform} - {query}\")\n    browser = None\n    try:\n        with sync_playwright() as p:\n            pos_x = 900 + ((window_offset_counter % 12) * 35)\n            pos_y = 50 + ((window_offset_counter % 12) * 35)\n            window_offset_counter += 1\n            browser = p.chromium.launch(headless=False, args=[f\"--window-position={pos_x},{pos_y}\", \"--window-size=1000,800\"])\n            active_browsers.add(browser)\n            context = browser.new_context(viewport={\"width\": 1000, \"height\": 800})\n            page = context.new_page()\n            page.set_default_timeout(25000)\n            page.goto(url, wait_until=\"domcontentloaded\", timeout=25000)\n            if \"gemini\" in plat_key or \"claude\" in plat_key:\n                time.sleep(2)\n                inject_and_submit_query(page, plat_key, query)\n            time.sleep(4)\n            start_t = time.time()\n            extracted_text = \"\"\n            last_t = \"\"\n            stable = 0\n            while (time.time() - start_t) < 25:\n                if stop_requested: break\n                curr = extract_clean_ai_response(page, plat_key)\n                if len(curr) >= 20:\n                    if curr == last_t:\n                        stable += 1\n                        if stable >= 4: extracted_text = curr; break\n                    else:\n                        stable = 0\n                        last_t = curr\n                time.sleep(0.5)\n            if not extracted_text: extracted_text = last_t or extract_clean_ai_response(page, plat_key)\n            print(f\"[LUA AI] 크롤링 완료 (길이: {len(extracted_text)})\")\n            if browser in active_browsers: active_browsers.remove(browser)\n            browser.close()\n            return jsonify({\"success\": True, \"raw_text\": extracted_text})\n    except Exception as e:\n        if browser and browser in active_browsers: active_browsers.remove(browser)\n        return jsonify({\"error\": str(e), \"raw_text\": \"\"}), 500\nif __name__ == \"__main__\":\n    print(\"[LUA AI] 내장 뷰어 크롤링용 로컬 API 서버 구동 완료 (Port: 5000)\")\n    app.run(host=\"0.0.0.0\", port=5000, debug=False, threaded=True)';" ^
  "[System.IO.File]::WriteAllBytes('C:\lua_crawler\api_server.py', [System.Convert]::FromBase64String($b64))"

:: 만약 로컬 프로젝트 경로가 존재하면 해당 경로로도 복사
if exist "c:\1.RuaCompany\lua_visibility_Web\src\services" (
    copy /Y "C:\lua_crawler\api_server.py" "c:\1.RuaCompany\lua_visibility_Web\src\services\api_server.py" > nul 2>&1
)

:: 3. 파이썬 설치 확인 및 부재 시 자동 설치
set "PY_CMD=python"
python --version > nul 2>&1
if %errorlevel% neq 0 (
    py --version > nul 2>&1
    if %errorlevel% equ 0 (
        set "PY_CMD=py"
    ) else (
        echo [3/5] 파이썬이 설치되어 있지 않습니다.
        echo       Python 3.11 자동 다운로드 및 설치를 시작합니다 (약 30초 소요)...
        powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile '%TEMP%\python_installer.exe'"
        echo [3/5] 파이썬 무인 설치를 진행합니다. 잠시만 기다려주세요...
        "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;C:\Program Files\Python311;C:\Program Files\Python311\Scripts;%PATH%"
    )
)

echo [3/5] 파이썬 환경 점검 완료: %PY_CMD%

:: 4. 필수 패키지 점검
echo [4/5] 필수 라이브러리(Flask, Playwright) 및 크롬 브라우저 점검 중...

:: 5. 서버 구동
echo [5/5] 루비스 로컬 크롤링 API 서버를 시작합니다...
echo -------------------------------------------------------------------
echo  * 실행 위치: %TARGET_DIR%\api_server.py
echo  * 로컬 API 주소: http://127.0.0.1:5000 (Port 5000)
echo  * 연동 대상: Cloudflare 배포 사이트(https://lua-visibility.pages.dev)
echo  * (본 터미널 창을 닫지 말고 최소화하여 유지해주세요.)
echo -------------------------------------------------------------------
echo.

cd /d "%TARGET_DIR%"
%PY_CMD% api_server.py

if %errorlevel% neq 0 (
    echo.
    echo [오류] 크롤러 서버가 예기치 않게 종료되었습니다.
    pause
)
