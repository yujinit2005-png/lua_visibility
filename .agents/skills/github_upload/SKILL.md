---
name: github_upload
description: "Automatically upload/push source code to GitHub repository yujinit2005-png/lua_visibility when requested."
---

# GitHub Upload Instructions

When the user requests to upload or push code to GitHub (e.g. "소스 올리라고 하면", "소스 올려줘", "깃허브 업로드"):

1. Verify git status and check modified files.
2. Stage all changed files: `git add .`
3. Commit with a meaningful message: `git commit -m "Feat: Auto update LUVIS Visibility Web"`
4. Push to remote origin: `git push -u origin main` or use `gh repo create yujinit2005-png/lua_visibility --private --source=. --remote=origin --push` if repository needs initial remote creation.
5. Provide a green checkmark (✅) response with upload summary.
