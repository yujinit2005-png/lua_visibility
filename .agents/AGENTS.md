# Project Rules for LUVIS Visibility Web

1. **Language:** ALWAYS answer in **Korean (한국어)**.
2. **Formatting:** 작업 완료 시 ✅ 체크마크를 반드시 표시할 것.
3. **Context First:** 프로젝트 시작 시 반드시 `mdfile 폴더 내 .md`를 먼저 읽고 프로젝트 맥락을 파악할 것.
4. **Reference Docs:** 상세 구현 현황은 `mdfile/Context.md`, DB 정보는 supabase 폴더내 파일 참조.
5. 프로그램 변경사항은 항상 mdfile/CHANGELOG.md 에 기록할 것.

## GitHub Upload Automation Rule

When the user asks to "소스 올려줘", "깃허브 업로드 해줘", or similar requests to push source code to GitHub:

1. Git remote repository target: `https://yujinit2005-png@github.com/yujinit2005-png/lua_visibility.git` (Account: `yujinit2005-png`).
2. Run standard git status / add / commit / push commands:
   - `git add .`
   - `git commit -m "Feat: Update LUVIS Visibility Web source code"`
   - `git push -u origin main`
3. Always provide clear, green checkmark (✅) confirmation upon completion.
