# Agents: next round (2 people)

Written 2026-11-21, after the 8B rebuild was merged (origin/main 88fa7e6). Read [AGENTS-8B-PLAN.md](AGENTS-8B-PLAN.md)
and [AGENTS-8B-GUARD.md](AGENTS-8B-GUARD.md) first if you are new to the agents.

**Why:** (1) nobody has measured the 8B model yet, and every guard failure shows the same `facts.summary`, so a low pass
rate brings back "the agents always say the same thing"; (2) the new Chats page (`web/src/components/ChatThread.tsx`)
lets the owner keep talking, but `/api/ask` gets no history: "Why?" or "And next month?" goes to Anna with no context.

| | Person A: quality of one answer | Person B: chat memory |
|---|---|---|
| Branch (from `origin/main`) | `agents8b-quality` | `agents8b-chat` |
| Files | `agents/cfo.ts` (only `askCfo`'s body after the model call), `agents/guard.ts`, `agents/facts.ts`, `agents/live.test.ts`, tests, docs | `shared/types.ts`, `routes/boardroom.ts` (`/ask`), `agents/topic.ts`, `agents/cfo.ts` (only `askPrompt` + `AskOptions`), tests. Web: `web/src/api/client.ts` + `ChatThread.tsx` only with Nara's (Pair 3) OK |
| Step 1 | Live run on 8B, write the numbers down | Add `history` to the ask API |
| Step 2 | Fallback that fits the question | History in the prompt + "stay with the same CFO" |
| Step 3 | One retry on a guard failure (bubble only) | Web sends the history |
| Step 4 (if time) | Label check: an amount next to the wrong label | Live check of follow-ups |

**Shared file:** both touch `agents/cfo.ts`, in different parts. **Merge order: B first, then A rebases on main.**
A also adds one field (`retry`) to `AskOptions`; on a conflict keep both fields.
Before every PR: `npm test`, `npm run typecheck`, `npm run build`. Never commit to `main`.

---

## Prompt for Person A (paste into Claude Code)

```text
Read CLAUDE.md, docs/AGENTS-NEXT.md, docs/AGENTS-8B-PLAN.md and docs/AGENTS-8B-GUARD.md first.
Create branch agents8b-quality from origin/main. Edit only: server/src/agents/{cfo,guard,facts,live.test}.ts, their
*.test.ts files and docs/. In agents/cfo.ts change only askCfo's body after the model call, plus one new field
`retry?: boolean` in AskOptions (Person B edits askPrompt and AskOptions on agents8b-chat; their PR merges first).
Keep code small and readable for beginners. No new dependencies. One commit per step, each with a vitest test.

A1. Measure 8B (no code change). Check the test copy runs the 8B model:
      curl.exe -s https://warsztat-cfo-test-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com/api/llm/health
    It must say "model":"llama-31-8b-instruct","ok":true. If not, stop and tell me.
    Then from server/ (PowerShell):
      $env:LIVE_APP_URL='https://warsztat-cfo-test-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com'; npx vitest run src/agents/live.test.ts
    Write "Live run on 8B" in docs/PAIR2-REBUILD.md: guard pass rate per CFO (goal >= 80%), the top fallback reasons
    with counts, answer time, meeting time per topic (goal < 22 s), and any number on screen that is not a rule number
    (must be 0). Show me the table before A2.

A2. A fallback that fits the question (agents/cfo.ts + facts.ts). Today a guard failure always shows facts.summary.
    Instead pick the facts.points that match the question (simple word overlap or a small keyword list per point id,
    deterministic, no model). If the best match is a detail point, put the CFO's first core point in front so the
    main advice never vanishes. No match -> facts.summary as today. Keep note/fromModel as they are.
    Tests: Kasia + "what is the EUR rate today?" with a failing model -> the rate point, not the whole summary;
    a question that matches nothing -> facts.summary; the first core point is always in the text.

A3. One retry on a guard failure, only when opts.retry is true (Person B's /ask route will pass it; until then,
    test it directly). Send the model its own reply plus "Your reply was rejected: <reason>. Use only numbers from
    the FACTS." and check again. Never retry for '' (model down) or when the LLM time budget is used up. The meeting
    never retries (22 s goal). Log "[guard] ask:<cfo> retry ok|retry failed <reason>".
    Tests: first reply bad, second good -> second shown, model called twice; both bad -> fallback from A2;
    retry false -> called once.
    Then run A1 again and add the new pass rate next to the old one in docs/PAIR2-REBUILD.md.

A4. Only if time is left and A1 showed wrong-label answers: in guard.ts, reject an amount written next to the wrong
    tax label (for example "ZUS of 14 230,00 zł" when 14 230 is VAT). Keep it small; the 31 "true" replies in
    review-corpus.ts must all still pass. Update the counts in docs/AGENTS-8B-GUARD.md.

Done when: npm test, npm run typecheck and npm run build pass, the live run numbers are in docs/PAIR2-REBUILD.md,
and a PR agents8b-quality -> main is open (rebase on main after Person B's PR is merged).
```

---

## Prompt for Person B (paste into Claude Code)

```text
Read CLAUDE.md, docs/AGENTS-NEXT.md and docs/AGENTS-8B-PLAN.md first.
Create branch agents8b-chat from origin/main. Edit only: shared/types.ts, server/src/routes/boardroom.ts (the /ask
route), server/src/agents/topic.ts, and in server/src/agents/cfo.ts only askPrompt and AskOptions (Person A edits
askCfo's body on agents8b-quality; your PR merges first). Plus their *.test.ts files. Web files (web/**) belong to
Pair 3: do B3 only after Nara says OK. Keep code small and readable for beginners. No new dependencies.
One commit per step, each with a vitest test.

Goal: the Chats page lets the owner keep talking after a meeting, but /api/ask gets no history. "Why?" or
"And next month?" has no keywords, so pickCfo sends it to Anna, who has no idea what was said.

B1. API (tell the team: this is an additive change to shared/types.ts, old clients keep working).
    In shared/types.ts add: export interface ChatLine { from: 'owner' | 'cfo'; cfo?: CfoId; text: string }
    and export interface AskRequest { question: string; cfo?: CfoId; history?: ChatLine[] }.
    In routes/boardroom.ts ASK_BODY: optional history, an array of at most 6 items, text maxLength 500,
    from is 'owner' or 'cfo'. Bad history -> 400, never 500. Keep only the last 4 lines.
    Tests: no history works as before; 7 items -> 400; {"history": "x"} -> 400.

B2. Use the history.
    (a) cfo.ts: AskOptions gets history?: ChatLine[]. askPrompt adds, before OWNER ASKS, a block
        "EARLIER IN THIS CHAT (context only, its numbers are not FACTS):" with one line per message
        ("Owner: ..." / "<CFO name>: ..."). The guard does NOT change: it still checks numbers only against the facts,
        so a number from the history (or the owner's message) can never reach the screen.
    (b) topic.ts: export a function followUpCfo(question, history) -> CfoId: a named CFO or a keyword match wins;
        otherwise the CFO who answered last in the history; otherwise pickCfo (Anna).
    (c) /ask uses followUpCfo when the body names no CFO, and passes history to askCfo.
    Tests: history where Kasia answered + "Why?" -> kasia; + "When is VAT due?" -> marek; the prompt contains the
    history block; history with "99 999 zł" and a fake model that repeats it -> the answer does not contain 99 999.

B3. Web (after Nara's OK): web/src/api/client.ts ask(question, cfo?, history?) and ChatThread.tsx sends the last 4
    messages as history. Also fix the stale top comment in ChatThread.tsx ("the model only picks points" is the old
    design; now the model writes and the guard checks numbers). The Ask bubble (AskBubble.tsx) can stay as it is.

B4. Check it live: open a branch build on the test copy
      oc patch bc warsztat-cfo-test -n my-first-model --type=merge -p '{"spec":{"source":{"git":{"ref":"agents8b-chat"}}}}'
      oc start-build warsztat-cfo-test --follow -n my-first-model
    Then on the site: Meeting "Should we lock the EUR rate?" -> in the chat below ask "Why?", "How much would it
    cost?", "OK, what first?". Each answer must come from Kasia and make sense after the meeting. Write the 3 answers
    and the [guard] log lines in docs/PAIR2-REBUILD.md under "Chat follow-ups". Ask before patching the build config.

Done when: npm test, npm run typecheck and npm run build pass, B4 is written down, and a PR agents8b-chat -> main
is open. Tell Person A when it is merged.
```
