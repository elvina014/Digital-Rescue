@AGENTS.md

# 업무 원칙

## 파일 수정 위치
코드 수정은 반드시 **실제 프로젝트 루트**(`C:\Users\BRAD\Documents\workspace\Digital-Rescue`)의 파일에 적용한다.
Claude Code가 플래닝 목적으로 생성하는 git worktree(`.claude/worktrees/` 하위 경로)는 격리된 임시 작업 공간이므로, worktree 안의 파일만 수정해서는 안 된다.
개발 서버와 `main` 브랜치 모두 프로젝트 루트 파일을 기준으로 동작하므로, 수정은 항상 해당 위치에서 이루어져야 한다.
