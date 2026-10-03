@AGENTS.md

# 업무 원칙

## 파일 수정 위치
코드 수정은 반드시 **실제 프로젝트 루트**(`C:\Users\BRAD\Documents\workspace\Digital-Rescue`)의 파일에 적용한다.
Claude Code가 플래닝 목적으로 생성하는 git worktree(`.claude/worktrees/` 하위 경로)는 격리된 임시 작업 공간이므로, worktree 안의 파일만 수정해서는 안 된다.
개발 서버와 `main` 브랜치 모두 프로젝트 루트 파일을 기준으로 동작하므로, 수정은 항상 해당 위치에서 이루어져야 한다.

# Repair Intelligence project

Before any Repair Intelligence work (device master data, repair records, part compatibility,
donors, part search, purchase guard, labels, VECTOR/AI integration), read
`docs/repair-intelligence/*.md` (00-current-state, 01-design-principles, 02-roadmap,
03-working-rules, and the relevant `phases/phase-N-*.md`) and follow them strictly:

- R1. One phase per session. Write `phases/phase-N-plan.md` first and STOP; implement only after Brad replies "APPROVED".
- R2. Additive changes only; no DROP/RENAME/type changes; no changes to existing triggers/functions unless the approved plan lists them.
- R3. New migration files only, each with rollback SQL. Apply only to the dev target Brad names; never to production (read-only MCP there).
- R4. RLS on every new table mirroring the existing role pattern; SECURITY DEFINER functions set search_path and check the caller's role; run advisors after migrations.
- R5. Inventory-affecting logic in single-transaction Postgres functions; optimistic UI with rollback and Korean validation messages.
- R6. After implementation: regenerate types, typecheck/lint/build pass, run the test plan, write `phases/phase-N-report.md`, summarise in Korean.
- R7. Branch `feat/repair-intelligence`; commit locally per phase; never push, merge or deploy.
- R8. Ambiguity, schema conflict, or a step failing twice → STOP and ask. No guessing, no scope widening.
- R9. Never delete or modify existing business data; backfills only via tools in the approved plan.
- R10. 노출된 스키마의 함수는 hint_roles 역할(anon/authenticated/service_role)에게서 EXECUTE를 빼앗는 방식으로 막지 않는다. 함수 내부 확인으로 거부한다. (KI-8, supautils 크래시) 노출되지 않는 스키마(vector_api 등)는 예외.

# CLAUDE.md (Karpathy-Inspired Claude Code Guidelines)

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```