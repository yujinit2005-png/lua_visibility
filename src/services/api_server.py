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

def inject_and_submit_query(page, plat_key: str, query: str):
    """
    URL 파라미터 지원이 안 되거나 입력창 입력이 필요한 플랫폼(Gemini, Claude 등)에 질문을 자동으로 입력하고 전송합니다.
    """
    if "gemini" in plat_key:
        print(f"[LUA AI - Gemini] 입력창 탐색 및 질문 전송 시도: {query}")
        gemini_selectors = [
            'div[contenteditable="true"]',
            'rich-textarea div[contenteditable="true"]',
            'div[role="textbox"]',
            'div[aria-label*="프롬프트"]',
            'div[aria-label*="Gemini"]',
            'div[aria-label*="Prompt"]',
            'textarea',
            '.ql-editor'
        ]
        
        input_elem = None
        for sel in gemini_selectors:
            try:
                elem = page.wait_for_selector(sel, timeout=4000)
                if elem and elem.is_visible():
                    input_elem = elem
                    print(f"[LUA AI - Gemini] 입력창 발견: {sel}")
                    break
            except Exception:
                continue
                
        if input_elem:
            try:
                input_elem.click()
                time.sleep(0.3)
                # contenteditable 요소는 keyboard.type이 가장 정확함
                page.keyboard.type(query, delay=15)
                time.sleep(0.5)
                page.keyboard.press("Enter")
                print("[LUA AI - Gemini] Enter 키 전송 완료")
            except Exception as e:
                print(f"[LUA AI - Gemini] 키보드 타이핑 예외: {e}")
                
            # 전송 버튼 클릭 Fallback
            try:
                time.sleep(0.5)
                send_btn = page.query_selector('button[aria-label*="보내기"], button[aria-label*="Send"], button.send-button, mat-icon[fonticon="send"]')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("[LUA AI - Gemini] 전송 버튼 클릭 완료")
            except Exception:
                pass
        else:
            print("[LUA AI - Gemini] ⚠ 입력창을 찾지 못해 클릭 후 키보드 타이핑을 시도합니다.")
            try:
                page.mouse.click(500, 400)
                page.keyboard.type(query, delay=15)
                page.keyboard.press("Enter")
            except Exception as e:
                print(f"[LUA AI - Gemini] 마우스 클릭 타이핑 실패: {e}")

    elif "claude" in plat_key:
        print(f"[LUA AI - Claude] 입력창 탐색 및 질문 전송 시도: {query}")
        claude_selectors = [
            'div[contenteditable="true"]',
            'fieldset div[contenteditable="true"]',
            'div[role="textbox"]',
            'textarea'
        ]
        for sel in claude_selectors:
            try:
                elem = page.wait_for_selector(sel, timeout=4000)
                if elem and elem.is_visible():
                    elem.click()
                    time.sleep(0.3)
                    page.keyboard.type(query, delay=15)
                    time.sleep(0.5)
                    page.keyboard.press("Enter")
                    print(f"[LUA AI - Claude] 질문 전송 완료: {sel}")
                    break
            except Exception:
                continue

def extract_clean_ai_response(page, platform: str) -> str:
    plat_key = platform.lower()
    selectors = []
    
    if "chatgpt" in plat_key:
        selectors = ['div[data-message-author-role="assistant"]', 'main article:last-of-type .markdown', 'article']
    elif "gemini" in plat_key:
        selectors = [
            'message-content:last-of-type',
            'message-content',
            '.model-response-text',
            '.response-container-content',
            'div[class*="model-response"]',
            'div[class*="response-container"]'
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
            # 창 우측 계단식 배치 계산
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
            context = browser.new_context(viewport={"width": 1000, "height": 800})
            page = context.new_page()
            
            page.goto(url)
            page.wait_for_load_state("domcontentloaded")
            
            # Gemini 또는 Claude처럼 페이지 로드 후 직접 입력이 필요한 경우 처리
            if "gemini" in plat_key or "claude" in plat_key:
                time.sleep(2.5)
                inject_and_submit_query(page, plat_key, query)
            
            # 렌더링 완료 대기 로직 (최대 45초 대기)
            start_time = time.time()
            max_timeout = 45
            stable_count = 0
            last_text = ""
            
            if "gemini" in plat_key: time.sleep(6)
            elif "perplexity" in plat_key: time.sleep(5)
            elif "chatgpt" in plat_key: time.sleep(5)
            elif "naver" in plat_key: time.sleep(3)
            else: time.sleep(3)
            
            extracted_text = ""
            
            while (time.time() - start_time) < max_timeout:
                curr_text = extract_clean_ai_response(page, plat_key)
                
                is_streaming = False
                if not curr_text or len(curr_text) < 20:
                    is_streaming = True
                elif query.strip() in curr_text and len(curr_text) < len(query.strip()) + 20:
                    is_streaming = True
                
                if not is_streaming:
                    if curr_text == last_text:
                        stable_count += 1
                        if stable_count >= 5: # 5번(약 2.5초) 동일하면 완료 간주
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
    app.run(host='127.0.0.1', port=5000, debug=False)
