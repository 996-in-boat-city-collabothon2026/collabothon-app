// Owner: Pair 3. Demo helpers for rehearsals.
//
// POST /api/demo/reset puts everything back to the seed (server/src/seed/*.json): balance 38 400 zł, no agent
// cards, one "Demo data reset" line in the activity log, default autonomy settings. The demo user stays logged in. "Today" is always 20.11.2026 (shop.today), so every
// rehearsal looks the same. Run it before each of the 3 rehearsals (Settings → "Reset demo").
//
// Demo on stage (docs/PLAN.md "Demo happy path") – what to click and what you should see:
// 1. Login → "Zaloguj się" (demo account). You land on the dashboard.
// 2. Dashboard → balance 38 400,00 zł, expenses pie (payroll 30 %, taxes 28 %, parts 26 %…),
//    cash forecast drops below the 15 000 zł buffer; lowest day 20.12 (−20 275,00 zł).
// 3. "Sprawdź teraz" (run check) → cards appear:
//    🔍 Marek re-validates rejected KSeF invoice FV/2026/11/009 · ✋ VAT 14 230,00 zł due 25.11 ·
//    ✋ Anna: credit line 36 000,00 zł for the December gap · ✋ Anna: payment reminders (FlotaTrans, Kurier Express) ·
//    ✋ Kasia: lock 1 500 EUR with a forward (EUR up 4 weeks in a row) · 💡 Tomasz: labour billed under the shop rate.
//    (Kasia, Tomasz and the reminders come from Pair 2's rules – visible once pair2-agents is merged into main.)
// 4. 💬 advice bubble → "Czy kurs euro to problem?" → Kasia answers.
// 5. "Zarząd CFO" (hat conference) → White (Marek) → Black (Anna) → Green (Tomasz) → Red (Kasia), then the Blue-hat plan.
// 6. "Do akceptacji" → approve VAT, the reminder and the hedge, reject the credit line → toast, balance drops
//    (VAT: 38 400 → 24 170 zł), every decision listed with 🧪 Simulated.
//    KSeF: open FV/2026/11/009 → "Popraw i wyślij" with a valid 10-digit NIP → accepted, KSeF number + UPO.
// 7. Header badge shows "Model: OpenShift AI" (green) – only on the cluster with LLM_MODE=openai_compat.
import type { FastifyPluginAsync } from 'fastify';
import { resetDb } from '../domain/store';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/demo/reset', async () => {
    resetDb();
    return { ok: true };
  });
};

export default routes;
