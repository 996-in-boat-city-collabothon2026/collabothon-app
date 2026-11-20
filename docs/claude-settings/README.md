# Keep Claude Code inside your pair's folders

Copy your pair's file to `.claude/settings.local.json` in the repo root (git-ignored, personal):

```powershell
New-Item -ItemType Directory -Force .claude; Copy-Item docs/claude-settings/pair3.json .claude/settings.local.json
```

Claude can still READ everything, but it can't edit other pairs' files. Restart `claude` after copying.
