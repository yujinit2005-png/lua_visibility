import os
import sys
import subprocess
import time
import urllib.parse
import urllib.request
import json
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

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from playwright.sync_api import sync_playwright

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        res = make_response()
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers["Access-Control-Allow-Headers"] = "*"
        res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
        res.headers["Access-Control-Allow-Private-Network"] = "true"
        return res, 200

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# 2. 크롤링 대상 기본 URL 및 로그인 URL
USER_DATA_DIR = os.path.join(os.environ.get('TARGET_DIR', 'C:/lua_crawler'), 'user_data')
os.makedirs(USER_DATA_DIR, exist_ok=True)

PLATFORM_URL_TEMPLATES = {
    # ✅ ChatGPT: 임시 채팅(메모리 없음) 사용 → 이전 대화/메모리 영향 차단
    # ?q= 로 질문 전달, 메모리 기능이 비활성화된 새 채팅으로 시작
    "chatgpt": "https://chatgpt.com/?q={query}&temporary-chat=true",
    
    # ✅ Gemini: /app 으로 항상 새 대화 시작 (이전 대화 참조 없음)
    "gemini": "https://gemini.google.com/app",
    "google gemini": "https://gemini.google.com/app",
    
    # ✅ Google: 일반 검색 (개인화 영향 최소)
    "google": "https://www.google.com/search?q={query}",
    
    # ✅ Perplexity: /search/new 를 사용하여 매번 새 검색 강제
    # (기존 /search?q= 는 이전 검색 세션이 남아있을 수 있음)
    "perplexity": "https://www.perplexity.ai/search/new?q={query}",
    
    # ✅ Naver: 실시간 검색, 개인화 영향 없음
    "naver": "https://search.naver.com/search.naver?query={query}",
    
    # ✅ Claude: /new 로 항상 새 대화 시작 (이전 대화 독립적)
    "claude": "https://claude.ai/new",
}

PLATFORM_LOGIN_URLS = {
    "chatgpt": "https://chatgpt.com/auth/login",
    "gemini": "https://gemini.google.com/app",
    "google gemini": "https://gemini.google.com/app",
    "perplexity": "https://www.perplexity.ai/",
    "claude": "https://claude.ai/login",
    "naver": "https://nid.naver.com/nidlogin.login",
}

# 활성화된 브라우저 및 취소 플래그 관리
active_browsers = set()
stop_requested = False
window_offset_counter = 0

# ===================================================================
# 🛡️ Cloudflare / 봇 감지 완전 차단 스텔스 스크립트
# Cloudflare Turnstile, Perplexity 봇 차단이 검사하는 모든 신호를 
# 페이지 로드 전에 주입하여 일반 사용자 브라우저로 위장합니다.
# ===================================================================
STEALTH_INIT_SCRIPT = """
// ── Playwright Stealth (최소 개입) ──
// 실제 Chrome(channel='chrome', headless=False)을 사용 중이므로,
// window.chrome이나 navigator.webdriver를 JS로 강제 덮어쓰면
// 오히려 Cloudflare Turnstile에 의해 "조작된 객체"로 감지되어 차단됩니다.
// (webdriver는 --disable-blink-features=AutomationControlled 옵션이 네이티브로 숨겨줍니다)

// Cloudflare Turnstile이 WebGPU 검사 시 발생하는 에러를 캐치하여 정상인 것처럼 위장
if (navigator.gpu) {
    const originalRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async function(options) {
        try {
            return await originalRequestAdapter(options);
        } catch(e) {
            console.warn("LUA AI: WebGPU requestAdapter fallback triggered");
            // 에러 발생 시 가짜 어댑터 반환 (Cloudflare 크래시 방지)
            return {
                features: new Set(),
                limits: {},
                isFallbackAdapter: false,
                requestDevice: async () => ({
                    features: new Set(),
                    limits: {},
                    queue: { submit: () => {} },
                    createCommandEncoder: () => ({ finish: () => ({}) })
                })
            };
        }
    };
}

// cdc_ (ChromeDriver/Playwright 자동화 변수) 흔적 제거
for (let prop in window) {
    if (prop.match(/cdc_[a-zA-Z0-9]/ig)) {
        delete window[prop];
    }
// ⑧ WebGL Vendor 위장 - GPU 기반 봇 감지 우회
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics';
    return getParameter.call(this, parameter);
};

// ⑨ Cloudflare challenge 루프 방지: 이전 cf_clearance 관련 오류 무시
window.addEventListener('error', (e) => { e.stopPropagation(); }, true);
"""



@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    return jsonify({"status": "ok", "message": "LUVIS Local Crawler Server is running", "time": time.time()})

@app.route('/api/open_login', methods=['POST', 'OPTIONS'])
def open_login_window():
    global window_offset_counter, active_browsers
    if request.method == 'OPTIONS':
        return '', 204
        
    data = request.json or {}
    platform = (data.get('platform') or 'perplexity').lower()
    mode = (data.get('mode') or 'direct').lower()  # 'direct' or 'google'
    login_url = PLATFORM_LOGIN_URLS.get(platform, "https://www.perplexity.ai/")
    
    print(f"\n[LUA AI] 🔑 사전 로그인 창 열기: {platform} (mode={mode}) -> {login_url}")
    
    try:
        import threading

        # ── 구글 연동 로그인 (Perplexity 봇 차단 우회 전용) ──────────────────────────
        def launch_google_then_perplexity():
            try:
                for lock_file in ["SingletonLock", "SingletonCookie", "SingletonSocket"]:
                    lf_path = os.path.join(USER_DATA_DIR, lock_file)
                    if os.path.exists(lf_path):
                        try: os.remove(lf_path)
                        except Exception as e: print(f"[LUA AI] ⚠️ {lock_file} 제거 실패: {e}")

                with sync_playwright() as p:
                    context = p.chromium.launch_persistent_context(
                        user_data_dir=USER_DATA_DIR,
                        channel="chrome",
                        headless=False,
                        viewport={"width": 1100, "height": 850},
                        ignore_default_args=["--enable-automation", "--no-sandbox"],
                        args=[
                            "--window-position=700,100",
                            "--window-size=1100,850",
                            "--no-first-run",
                            "--no-default-browser-check",
                            "--disable-session-crashed-bubble",
                            "--disable-sync",
                            "--disable-blink-features=AutomationControlled",
                            "--disable-infobars",
                            "--use-gl=angle",
                            "--use-angle=gl",
                            "--enable-webgl",
                            "--enable-unsafe-webgpu",
                            "--ignore-gpu-blocklist",
                        ]
                    )
                    context.add_init_script(STEALTH_INIT_SCRIPT)
                    page = context.pages[0] if context.pages else context.new_page()

                    # 1단계: 구글 로그인 페이지로 이동
                    print("[LUA AI] 🔑 1단계: Google 로그인 페이지 이동...")
                    page.goto("https://accounts.google.com/signin", wait_until="domcontentloaded")

                    # 2단계: 사용자가 구글 로그인 완료할 때까지 대기 (최대 5분)
                    # 로그인 완료 시 myaccount.google.com 으로 돌아옴
                    print("[LUA AI] ⏳ 구글 로그인 완료 대기 중... (최대 5분)")
                    try:
                        page.wait_for_url("https://myaccount.google.com/**", timeout=300000)
                    except Exception:
                        pass  # 타임아웃 시 다음 단계로 계속 시도

                    current_url = page.url
                    print(f"[LUA AI] ✅ 구글 로그인 처리 완료. 현재 URL: {current_url}")

                    # 3단계: Perplexity로 자동 이동
                    print("[LUA AI] 🔄 2단계: Perplexity.ai로 자동 이동...")
                    page.goto("https://www.perplexity.ai/", wait_until="domcontentloaded", timeout=30000)
                    time.sleep(2)

                    # 4단계: "Continue with Google" 버튼 자동 클릭
                    print("[LUA AI] 🔍 3단계: 'Continue with Google' 버튼 감지 시도...")
                    google_btn_selectors = [
                        "button:has-text('Continue with Google')",
                        "button:has-text('Google로 계속')",
                        "button:has-text('Google로 시작')",
                        "a:has-text('Continue with Google')",
                        "[data-testid='google-login-button']",
                        ".google-login",
                        "button[class*='google']",
                    ]
                    clicked = False
                    for selector in google_btn_selectors:
                        try:
                            btn = page.locator(selector).first
                            if btn.count() > 0:
                                btn.click(timeout=5000)
                                clicked = True
                                print(f"[LUA AI] ✅ 'Continue with Google' 버튼 클릭 성공: {selector}")
                                break
                        except Exception:
                            continue

                    if not clicked:
                        print("[LUA AI] ⚠️ 'Continue with Google' 버튼 자동 클릭 실패 - 수동으로 로그인하세요.")

                    # 5단계: Perplexity 로그인 완료 대기
                    print("[LUA AI] ⏳ Perplexity 로그인 완료 대기...")
                    try:
                        page.wait_for_url("*perplexity.ai/**", timeout=30000)
                    except Exception:
                        pass
                    time.sleep(2)
                    print(f"[LUA AI] ✅ Perplexity 사전 로그인 완료. 세션이 {USER_DATA_DIR} 에 저장되었습니다.")

                    # 사용자가 창을 닫을 때까지 대기
                    try:
                        page.wait_for_event("close", timeout=600000)
                    except Exception:
                        pass
                    context.close()
            except Exception as ex:
                print(f"[LUA AI] 구글 연동 로그인 오류: {ex}")

        # ── 직접 로그인 (기존 방식) ────────────────────────────────────────────────
        def launch_login_browser():
            try:
                # SingletonLock 파일 제거 (이전 세션 잠금 해제)
                for lock_file in ["SingletonLock", "SingletonCookie", "SingletonSocket"]:
                    lf_path = os.path.join(USER_DATA_DIR, lock_file)
                    if os.path.exists(lf_path):
                        try:
                            os.remove(lf_path)
                            print(f"[LUA AI] 🔓 사전 로그인 전 {lock_file} 제거 완료")
                        except Exception as e:
                            print(f"[LUA AI] ⚠️ {lock_file} 제거 실패: {e}")
                
                with sync_playwright() as p:
                    base_x = 700
                    base_y = 100
                    context = p.chromium.launch_persistent_context(
                        user_data_dir=USER_DATA_DIR,
                        channel="chrome",
                        headless=False,
                        viewport={"width": 1100, "height": 850},
                        ignore_default_args=[
                            "--enable-automation",
                            "--no-sandbox",
                        ],
                        args=[
                            f"--window-position={base_x},{base_y}",
                            "--window-size=1100,850",
                            "--no-first-run",
                            "--no-default-browser-check",
                            "--disable-session-crashed-bubble",
                            "--disable-sync",
                            "--disable-blink-features=AutomationControlled",
                            "--disable-infobars",
                            "--use-gl=angle",
                            "--use-angle=gl",
                            "--enable-webgl",
                            "--enable-unsafe-webgpu",
                            "--ignore-gpu-blocklist",
                        ]
                    )
                    context.add_init_script(STEALTH_INIT_SCRIPT)
                    page = context.pages[0] if context.pages else context.new_page()
                    page.goto(login_url)
                    print(f"[LUA AI] 🔑 {platform} 로그인 창이 열렸습니다. 로그인 후 창을 닫아주세요.")
                    try:
                        page.wait_for_event("close", timeout=600000)
                    except Exception:
                        pass
                    context.close()
                    print(f"[LUA AI] ✅ {platform} 사전 로그인 완료 - 세션이 {USER_DATA_DIR} 에 저장되었습니다.")
            except Exception as ex:
                print(f"[LUA AI] 사전 로그인 창 실행 오류: {ex}")

        # mode에 따라 적절한 함수 실행
        if platform == 'perplexity' and mode == 'google':
            t = threading.Thread(target=launch_google_then_perplexity, daemon=True)
        else:
            t = threading.Thread(target=launch_login_browser, daemon=True)
        t.start()
        
        return jsonify({
            "success": True,
            "message": f"[{platform.upper()}] {'\uad6c\uae00 \uc5f0\ub3d9 ' if mode == 'google' else ''}\uc0ac전 \ub85c\uadf8\uc778 \ube0c\ub77c\uc6b0\uc800 \ucc3d\uc744 \ub744\uc6e0\uc2b5\ub2c8\ub2e4. \ub85c\uadf8\uc778 \ud6c4 \ucc3d\uc744 \ub2eb\uc73c\uc2dc\uba74 \uc138\uc158\uc774 \uc601\uad6c \ubcf4\uc874\ub429\ub2c8\ub2e4.",
            "url": login_url,
            "mode": mode
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/close_all', methods=['POST', 'GET', 'OPTIONS'])
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

@app.route('/api/naver-search', methods=['GET', 'OPTIONS'])
def naver_search_proxy():
    if request.method == 'OPTIONS':
        return '', 204
    
    query = request.args.get('query', '')
    display = request.args.get('display', '20')
    start = request.args.get('start', '1')
    sort = request.args.get('sort', 'random')
    
    client_id = request.headers.get('X-NCP-APIGW-API-KEY-ID', os.environ.get('NCP_APIGW_API_KEY_ID', 'i8ciwrvzln'))
    client_secret = request.headers.get('X-NCP-APIGW-API-KEY', os.environ.get('NCP_APIGW_API_KEY', '9EXRQssZga4OCcnnn1hdM3V9KlSEYzKefwJMvK2x'))
    
    encoded_query = urllib.parse.quote(query)
    target_url = f"https://naverapihub.apigw.ntruss.com/search/v1/local?query={encoded_query}&display={display}&start={start}&sort={sort}"
    
    try:
        req = urllib.request.Request(target_url)
        req.add_header('X-NCP-APIGW-API-KEY-ID', client_id)
        req.add_header('X-NCP-APIGW-API-KEY', client_secret)
        
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode('utf-8')
            return app.response_class(res_body, mimetype='application/json')
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        return jsonify({"error": f"HTTP {e.code}: {err_body}"}), e.code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
    
    # 🔑 SingletonLock 제거: 이전 persistent context(사전 로그인 등) 종료 후 잠금 파일이
    # 남아있을 경우, 새 persistent_context 실행 시 새 프로파일로 강제 실행되어
    # 로그인 세션이 사라지는 문제를 방지합니다.
    for lock_file in ["SingletonLock", "SingletonCookie", "SingletonSocket"]:
        lf_path = os.path.join(USER_DATA_DIR, lock_file)
        if os.path.exists(lf_path):
            try:
                os.remove(lf_path)
                print(f"[LUA AI] 🔓 {lock_file} 잠금 파일 제거 완료 → 세션 정상 로드")
            except Exception as e:
                print(f"[LUA AI] ⚠️ {lock_file} 제거 실패: {e}")
    
    context = None
    try:
        with sync_playwright() as p:
            base_x = 900
            base_y = 50
            step = 35
            
            offset = window_offset_counter % 12
            pos_x = base_x + (offset * step)
            pos_y = base_y + (offset * step)
            window_offset_counter += 1

            # 실제 설치된 Chrome 사용 (channel='chrome')
            # ignore_default_args: Playwright가 자동 추가하는 --no-sandbox, --enable-automation 제거
            # → 이 플래그들이 Cloudflare 봇 감지의 핵심 트리거
            context = p.chromium.launch_persistent_context(
                user_data_dir=USER_DATA_DIR,
                channel="chrome",
                headless=False,
                viewport={"width": 1000, "height": 800},
                ignore_default_args=[
                    "--enable-automation",   # '자동화에 의해 제어됩니다' 배너 제거
                    "--no-sandbox",          # Cloudflare 봇 감지 최강 신호 제거
                ],
                args=[
                    f"--window-position={pos_x},{pos_y}", 
                    "--window-size=1000,800",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-session-crashed-bubble",
                    "--disable-sync",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--use-gl=angle",
                    "--use-angle=gl",
                    "--enable-webgl",
                    "--enable-unsafe-webgpu",
                    "--ignore-gpu-blocklist",
                ]
            )
            # ✅ Cloudflare 완전 우회 스텔스 스크립트 주입 (Perplexity 봇 차단 루프 방지)
            context.add_init_script(STEALTH_INIT_SCRIPT)
            active_browsers.add(context)
            
            page = context.pages[0] if context.pages else context.new_page()
            page.set_default_timeout(25000)
            
            page.goto(url, wait_until="domcontentloaded", timeout=25000)
            
            if stop_requested:
                if context: context.close()
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
            if context in active_browsers:
                active_browsers.remove(context)
            context.close()
            
            return jsonify({"success": True, "raw_text": extracted_text})
            
    except Exception as e:
        if context and context in active_browsers:
            try: active_browsers.remove(context)
            except Exception: pass
            try: context.close()
            except Exception: pass
        traceback.print_exc()
        return jsonify({"error": str(e), "raw_text": ""}), 500

if __name__ == '__main__':
    print("[LUA AI] 내장 뷰어 크롤링용 로컬 API 서버 구동 완료 (Port: 5000)")
    print("[LUA AI] 대기 중... (http://127.0.0.1:5000 / http://localhost:5000)")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
