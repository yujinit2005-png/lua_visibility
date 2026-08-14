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

# 2. 크롤링 대상 기본 URL
PLATFORM_URL_TEMPLATES = {
    "chatgpt": "https://chatgpt.com/?q={query}",
    "gemini": "https://gemini.google.com/app",
    "google gemini": "https://gemini.google.com/app",
    "google": "https://www.google.com/search?q={query}",
    "perplexity": "https://www.perplexity.ai/search?q={query}",
    "naver": "https://search.naver.com/search.naver?query={query}",
    "claude": "https://claude.ai/new",
}

# 활성화된 브라우저 및 취소 플래그 관리
active_browsers = set()
stop_requested = False
window_offset_counter = 0

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "time": time.time()})

@app.route('/api/close_all', methods=['POST', 'GET'])
def close_all_browsers():
    global active_browsers, stop_requested
    stop_requested = True
    closed_count = 0
    print("\n[LUA AI] 🛑 전체 내장 창 일괄 닫기 및 크롤링 중단 요청 수신")
    
    for b in list(active_browsers):
        try:
            b.close()
            closed_count += 1
        except Exception:
            pass
    active_browsers.clear()
    
    print(f"[LUA AI] {closed_count}개 브라우저 창 닫기 완료.")
    time.sleep(0.3)
    stop_requested = False
    
    return jsonify({
        "success": True, 
        "message": f"모든 브라우저 창({closed_count}개)이 성공적으로 닫혔습니다."
    })

def inject_and_submit_query(page, plat_key: str, query: str):
    try:
        if "gemini" in plat_key:
            print(f"[LUA AI - Gemini] 질문 입력 시도: {query}")
            gemini_selectors = [
                'div[contenteditable="true"]',
                'rich-textarea div[contenteditable="true"]',
                'div[role="textbox"]',
                'div[aria-label*="프롬프트"]',
                'div[aria-label*="Gemini"]',
                'textarea'
            ]
            
            input_elem = None
            for sel in gemini_selectors:
                try:
                    elem = page.wait_for_selector(sel, timeout=2500)
                    if elem and elem.is_visible():
                        input_elem = elem
                        break
                except Exception:
                    continue
                    
            if input_elem:
                input_elem.click()
                time.sleep(0.2)
                page.keyboard.type(query, delay=10)
                time.sleep(0.3)
                page.keyboard.press("Enter")
                print("[LUA AI - Gemini] Enter 키 전송 완료")
            else:
                page.mouse.click(500, 400)
                page.keyboard.type(query, delay=10)
                page.keyboard.press("Enter")

        elif "claude" in plat_key:
            print(f"[LUA AI - Claude] 질문 입력 시도: {query}")
            elem = page.wait_for_selector('div[contenteditable="true"]', timeout=3000)
            if elem:
                elem.click()
                page.keyboard.type(query, delay=10)
                page.keyboard.press("Enter")
    except Exception as e:
        print(f"[LUA AI] 질문 입력 중 예외 (무시하고 계속 진행): {e}")

def extract_clean_ai_response(page, platform: str) -> str:
    plat_key = platform.lower()
    selectors = []
    
    if "chatgpt" in plat_key:
        selectors = ['div[data-message-author-role="assistant"]', 'main article:last-of-type .markdown', 'article']
    elif "gemini" in plat_key:
        selectors = [
            '.response-container-content',
            'message-content:last-of-type',
            'message-content',
            '.model-response-text',
            'div[class*="model-response"]'
        ]
    elif "perplexity" in plat_key:
        selectors = ['div[data-testid="search-response"]:last-of-type', '.prose', '.answer-content', 'div.break-words']
    elif "naver" in plat_key:
        selectors = ['.api_txt_lines', '.total_wrap', '#main_pack']
    elif "claude" in plat_key:
        selectors = ['.font-claude-message', 'div[data-is-streaming="false"]', '.prose']

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
        r"^모두 허용", r"^ChatGPT는 AI라 실수할 수 있습니다", r"새 채팅|이미지|플러그인|도움말",
        r"^로그인하여 Google 계정에 연결하고", r"^개인 AI 어시스턴트인 Gemini를 만나 보세요"
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

@app.route('/api/verify', methods=['POST'])
def verify_platform():
    global window_offset_counter, active_browsers, stop_requested
    if stop_requested:
        return jsonify({"error": "Stopped by user", "raw_text": ""}), 400
        
    data = request.json or {}
    platform = data.get('platform', 'ChatGPT')
    query = data.get('query', '')
    
    if not query:
        return jsonify({"error": "Query is required", "raw_text": ""}), 400
        
    plat_key = platform.lower()
    tpl = PLATFORM_URL_TEMPLATES.get(plat_key, "https://chatgpt.com/?q={query}")
    url = tpl.format(query=urllib.parse.quote(query))
    
    print(f"\n[LUA AI] 크롤링 시작: {platform} - {query}")
    
    browser = None
    try:
        with sync_playwright() as p:
            base_x = 900
            base_y = 50
            step = 35
            
            offset = window_offset_counter % 12
            pos_x = base_x + (offset * step)
            pos_y = base_y + (offset * step)
            window_offset_counter += 1

            browser = p.chromium.launch(headless=False, args=[
                f"--window-position={pos_x},{pos_y}", 
                "--window-size=1000,800"
            ])
            active_browsers.add(browser)
            
            context = browser.new_context(viewport={"width": 1000, "height": 800})
            page = context.new_page()
            page.set_default_timeout(25000)
            
            page.goto(url, wait_until="domcontentloaded", timeout=25000)
            
            if stop_requested:
                if browser: browser.close()
                return jsonify({"error": "Stopped by user", "raw_text": ""}), 400
            
            # Gemini / Claude 질문 주입
            if "gemini" in plat_key or "claude" in plat_key:
                time.sleep(2)
                if not stop_requested:
                    inject_and_submit_query(page, plat_key, query)
            
            # 렌더링 완료 대기 (최대 25초)
            start_time = time.time()
            max_timeout = 25
            stable_count = 0
            last_text = ""
            
            if "gemini" in plat_key: time.sleep(5)
            elif "perplexity" in plat_key: time.sleep(4)
            elif "chatgpt" in plat_key: time.sleep(4)
            else: time.sleep(3)
            
            extracted_text = ""
            
            while (time.time() - start_time) < max_timeout:
                if stop_requested:
                    break
                    
                curr_text = extract_clean_ai_response(page, plat_key)
                
                is_streaming = False
                if not curr_text or len(curr_text) < 20:
                    is_streaming = True
                elif query.strip() in curr_text and len(curr_text) < len(query.strip()) + 20:
                    is_streaming = True
                
                if not is_streaming:
                    if curr_text == last_text:
                        stable_count += 1
                        if stable_count >= 4: # 약 2초 동일하면 완료
                            extracted_text = curr_text
                            break
                    else:
                        stable_count = 0
                        last_text = curr_text
                        
                time.sleep(0.5)
                
            if not extracted_text:
                extracted_text = last_text if last_text else extract_clean_ai_response(page, plat_key)
            
            print(f"[LUA AI] 크롤링 완료 (길이: {len(extracted_text)})")
            if browser in active_browsers:
                active_browsers.remove(browser)
            browser.close()
            
            return jsonify({"success": True, "raw_text": extracted_text})
            
    except Exception as e:
        if browser and browser in active_browsers:
            try: active_browsers.remove(browser)
            except Exception: pass
        traceback.print_exc()
        return jsonify({"error": str(e), "raw_text": ""}), 500

if __name__ == '__main__':
    print("[LUA AI] 내장 뷰어 크롤링용 로컬 API 서버 구동 완료 (Port: 5000)")
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True)
