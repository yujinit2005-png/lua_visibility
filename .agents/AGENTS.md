# Project Rules for LUVIS Visibility Web

## GitHub Upload Automation Rule
When the user asks to "소스 올려줘", "깃허브 업로드 해줘", or similar requests to push source code to GitHub:
1. Git remote repository target: `git@github.com:yujinit2005-png/lua_visibility.git` (or `https://github.com/yujinit2005-png/lua_visibility.git`).
2. Run standard git status / add / commit / push commands:
   - `git add .`
   - `git commit -m "Feat: Update LUVIS Visibility Web source code"`
   - `git push -u origin main`
3. Always provide clear, green checkmark (✅) confirmation upon completion.
