# 운영 반영 명령어 — Phase 7.1 (라벨: 폼텍 3102 · PNG 저장 · A4 지정 칸 인쇄)

작성 2026-11-28 · 실행: **Brad** (Claude는 push·merge·배포를 하지 않음, R7)
기준: `origin/main` = `d4b89fe` (현재 운영 코드)

| 대상 | 내용 |
| --- | --- |
| DB | **변경 없음** — 마이그레이션·백업·DB 롤백 불필요 |
| 앱 | `feat/repair-intelligence`: `main`보다 커밋 3개 앞 (plan·승인 조건, 구현, 이 문서). `main`에서 새로 분기해 충돌 없음 |

화면 코드만 바뀌므로 업무 중에 반영해도 됩니다.

---

## 0. 사전 확인 (로컬)

```powershell
git fetch origin
```
```powershell
git rev-parse origin/main
```
기대: `d4b89fe1e8cb962179d5df2cad03cbbbdfbc21bf`. 다르면 **중단** — 그 사이 `main`이 바뀌었으니 Claude에게 다시 확인을 요청하세요.

```powershell
git log --oneline origin/main..feat/repair-intelligence
```
기대: Phase 7.1 커밋 3개만.

## 1. 되돌릴 기준 표시

```powershell
git tag -a pre-phase-7.1 origin/main -m "Production before Phase 7.1 (label sheet)"
```
```powershell
git push origin pre-phase-7.1
```
Vercel → Deployments → 현재 **Production** 배포의 ID·커밋(`d4b89fe`)을 적어 둡니다 (롤백용).

## 2. push · PR

```powershell
git push origin feat/repair-intelligence
```
원격 브랜치는 `f17eda9`(이미 `main`에 병합됨)에 있어서 그대로 fast-forward 됩니다. `rejected`가 나오면 **중단**하고 Claude에게 보여 주세요. `--force`는 쓰지 마세요.

```powershell
gh pr create --base main --head feat/repair-intelligence --title "feat(labels): 폼텍 3102 라벨 · PNG 저장 · A4 지정 칸 인쇄 (Phase 7.1)" --body "Plan/report: docs/repair-intelligence/phases/phase-7.1-plan.md, phase-7.1-report.md. UI only, no DB change."
```
- Vercel Preview가 **Ready**인지 확인합니다. 빌드가 실패하면 로그를 Claude에게 주세요.
- **Preview에서 라벨을 인쇄해 붙이지 마세요.** QR은 인쇄한 페이지의 주소를 가리키므로, Preview에서 인쇄한 라벨은 Preview 주소로 연결됩니다. Preview에서는 화면이 열리는지만 봅니다.

## 3. 병합 (= 운영 배포)

GitHub 화면에서 **Merge pull request**를 누르거나:
```powershell
gh pr merge --merge
```
병합하면 Vercel이 `main`을 운영에 배포합니다. Hobby 플랜이면 병합 뒤 바로 다른 커밋을 `main`에 넣지 마세요. 그래야 "바로 이전 배포"로 롤백할 수 있습니다.

로컬 `main`도 맞춰 둡니다:
```powershell
git checkout main
```
```powershell
git pull --ff-only origin main
```

## 4. 운영 확인 (`login.digital-rescue.com`, 관리자 또는 팀장 계정)

1. **라벨 인쇄**에서 항목을 선택하고 인쇄 화면을 엽니다. 위쪽에 `폼텍 3102 (A4 40칸)` / `감열 라벨` 전환 버튼과 `이미지 저장 (전체)` 버튼이 보이면 정상입니다.
2. **시험 인쇄**: `칸 테두리도 인쇄`를 켜고 **일반 A4 용지**에 인쇄합니다 (여백 '없음', 배율 100%). 라벨지와 겹쳐 보고 여백·간격을 맞춥니다.
   - 맞춘 값은 그 PC에 저장됩니다. Claude에게 알려 주면 코드 기본값으로 반영합니다 (Phase 7.1 후속).
3. 실제 3102 라벨지에 1~2장 인쇄합니다 → 휴대폰이나 **라벨 조회**로 QR을 스캔했을 때 해당 품목이 열리면 정상입니다.
4. `이미지 저장 (전체)` → PNG를 폼텍 프로그램 칸에 넣었을 때 크기가 맞는지 확인합니다.

## 되돌리기

DB는 바뀌지 않았으니 앱만 되돌리면 됩니다.

**방법 1 — Vercel (즉시):** Vercel → Project → **Instant Rollback** → 1단계에서 적어 둔 배포(`d4b89fe`) 선택 → Confirm.
롤백 후 Vercel은 Production 자동 할당을 끕니다. 수정본을 배포한 뒤 **Undo Rollback**으로 다시 켭니다 (`release-runbook.md` L1).

**방법 2 — 코드 되돌리기 (영구):** 병합 커밋을 되돌리는 PR을 만듭니다. GitHub의 PR 화면에서 **Revert** 버튼을 쓰면 가장 간단합니다.
