# Spec: Web UI (Pair 3)

Audience: a busy car repair shop owner, any age, often on a phone. Judges score **UI/UX (12 pts)** and whether the UI
clearly separates **🔍 analysed / 💡 recommended / ✋ needs approval / 🧪 simulated vs ✅ permitted**.

## Files
- `web/src/api/client.ts`: the only place with API URLs + the `useApi()` hook.
- `web/src/components/ui.tsx`: Card, TierBadge, ExecutionBadge, CfoAvatar, ActionCard, LlmStatusBadge, Status, fmtPLN.
- `web/src/pages/*`: Dashboard, Approvals, Boardroom, Ksef, Activity, Settings. `web/src/i18n.tsx`: PL/EN dictionary.

## Rules
- Mobile first: test at 375 px. No horizontal scroll. Touch targets ≥ 44 px. Base font 17 px.
- Every screen has loading, empty and error states.
- Money as `12 430,00 zł` (`fmtPLN`). Dates `DD.MM` on mobile is fine.
- The header badge always shows which model is answering (green = OpenShift AI).
- Every approval-type card has a "Why?" with the numbers. Approve/Reject gives instant feedback (toast) and the balance updates.

## Next tasks
1. Toasts. 2. Boardroom typing animation + "Approve decision" buttons. 3. Forecast 30/60/90 toggle.
4. Translate remaining strings. 5. Visual polish (spacing, icons, colours per CFO). 6. Accessibility labels.
