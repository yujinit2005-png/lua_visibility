import os
import sys
import subprocess
import time
import urllib.parse
import re
import traceback

# 1. 자동 패키지 설치 로직
def install_requirements():
    required_packages = ['flask', 'flask-cors', 'playwright']
    needs_install = False
    
    for pkg in required_packages:
        try:
            if pkg == 'flask-cors':
                import flask_cors
            else:
                __import__(pkg)
        except ImportError:
            needs_install = True
            break
            
    if needs_install:
        print("[LUA AI] 필수 패키지가 없습니다. 자동 설치를 진행합니다...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + required_packages)
            print("[LUA AI] 패키지 설치 완료.")
            print("[LUA AI] Playwright 브라우저 바이너리를 설치합니다...")
            subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
            print("[LUA AI] 브라우저 설치 완료.")
        except Exception as e:
            print(f"[LUA AI] 패키지 설치 중 오류 발생: {e}")

install_requirements()

# 패키지 설치 후 임포트
from flask import Flask, request, jsonify
from flask_cors import CORS
from playwright.sync_api import sync_playwright

app = Flask(__name__)
CORS(app)

# 2. 크롤링 로직 (기존 web_verifier.py 핵심 로직)
PLATFORM_URL_TEMPLATES = {
    "chatgpt": "https://chatgpt.com/?q={query}",
    "gemini": "https://gemini.google.com/app",
    "google gemini": "https://gemini.google.com/app",
    "google": "https://www.google.com/search?q={query}",
    "perplexity": "https://www.perplexity.ai/search?q={query}",
    "naver": "https://search.naver.com/search.naver?query={query}",
}

def extract_clean_ai_response(page, platform: str) -> str:
    plat_key = platform.lower()
    selectors = []
    
    if "chatgpt" in plat_key:
        selectors = ['div[data-message-author-role="assistant"]', 'main article:last-of-type .markdown', 'article']
    elif "gemini" in plat_key:
        selectors = ['message-content:last-of-type', 'message-content', '.model-response-text']
    elif "perplexity" in plat_key:
        selectors = ['div[data-testid="search-response"]:last-of-type', '.prose', '.answer-content', 'div.break-words']
    elif "naver" in plat_key:
        selectors = ['.api_txt_lines', '.total_wrap', '#main_pack']

    raw_text = ""
    for sel in selectors:
        try:
            elems = page.query_selector_all(sel)
            if elems:
                texts = [e.inner_text().strip() for e in elems if e.inner_text().strip()]
                if texts:
                    raw_text = texts[-1] if len(texts[-1]) > 20 else "\n\n".join(texts)
                    break
        except Exception:
            pass

    if not raw_text or len(raw_text) < 10:
        try:
            main_elem = page.query_selector('main')
            if main_elem:
                raw_text = main_elem.inner_text() or ""
            else:
                raw_text = page.evaluate("() => document.body.innerText") or ""
        except Exception:
            raw_text = ""

    junk_patterns = [
        r"^콘텐츠로 건너뛰기", r"^채팅 기록", r"^저희는 쿠키를 사용합니다", r"^비필수사항 거부", 
        r"^모두 허용", r"^ChatGPT는 AI라 실수할 수 있습니다", r"새 채팅|이미지|플러그인|도움말"
    ]
    
    clean_lines = []
    for line in raw_text.splitlines():
        line_str = line.strip()
        if not line_str: continue
        is_junk = False
        for pat in junk_patterns:
            if re.search(pat, line_str, re.IGNORECASE):
                is_junk = True
                break
        if not is_junk:
            clean_lines.append(line_str)
            
    return "\n".join(clean_lines).strip()

window_offset_counter = 0

@app.route('/api/verify', methods=['POST'])
def verify_platform():
    global window_offset_counter
    data = request.json
    platform = data.get('platform', 'ChatGPT')
    query = data.get('query', '')
    
    if not query:
        return jsonify({"error": "Query is required", "raw_text": ""}), 400
        
    plat_key = platform.lower()
    tpl = PLATFORM_URL_TEMPLATES.get(plat_key, "https://chatgpt.com/?q={query}")
    url = tpl.format(query=urllib.parse.quote(query))
    
    print(f"\n[LUA AI] 크롤링 시작: {platform} - {query}")
    
    try:
        with sync_playwright() as p:
            # 창 우측 계단식 배치 계산 (x: 900 이상이면 보통 우측 모니터 공간)
            base_x = 900
            base_y = 50
            step = 35
            
            offset = window_offset_counter % 12  # 최대 12개 계단식 배치 후 다시 원위치
            pos_x = base_x + (offset * step)
            pos_y = base_y + (offset * step)
            window_offset_counter += 1

            # 팝업이 눈에 보이게(headless=False), 시크릿 모드(launch)로 실행 및 좌표 지정
            browser = p.chromium.launch(headless=False, args=[
                f"--window-position={pos_x},{pos_y}", 
                "--window-size=1000,800"
            ])
            # 시크릿(incognito) 컨텍스트
            context = browser.new_context(viewport={"width": 1000, "height": 800})
            page = context.new_page()
            
            page.goto(url)
            
            # 렌더링 완료 대기 로직 (최대 45초 대기)
            start_time = time.time()
            max_timeout = 45
            stable_count = 0
            last_text = ""
            
            if "gemini" in plat_key: time.sleep(8)
            elif "perplexity" in plat_key: time.sleep(6)
            elif "chatgpt" in plat_key: time.sleep(6)
            elif "naver" in plat_key: time.sleep(4)
            else: time.sleep(4)
            
            extracted_text = ""
            
            while (time.time() - start_time) < max_timeout:
                curr_text = extract_clean_ai_response(page, plat_key)
                
                is_streaming = False
                # 너무 짧거나, 검색어 자체만 추출된 경우 렌더링 시작 전으로 간주
                if not curr_text or len(curr_text) < 20:
                    is_streaming = True
                elif query.strip() in curr_text and len(curr_text) < len(query.strip()) + 20:
                    is_streaming = True
                
                if not is_streaming:
                    if curr_text == last_text:
                        stable_count += 1
                        if stable_count >= 6: # 6번(약 3초) 동일하면 완료 간주
                            extracted_text = curr_text
                            break
                    else:
                        stable_count = 0
                        last_text = curr_text
                        
                time.sleep(0.5)
                
            if not extracted_text:
                extracted_text = last_text if last_text else extract_clean_ai_response(page, plat_key)
            
            print(f"[LUA AI] 크롤링 완료 (길이: {len(extracted_text)})")
            browser.close()
            
            return jsonify({"success": True, "raw_text": extracted_text})
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "raw_text": ""}), 500

if __name__ == '__main__':
    print("[LUA AI] 내장 뷰어 크롤링용 로컬 API 서버 구동 완료 (Port: 5000)")
    # 서버 띄우기
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)
