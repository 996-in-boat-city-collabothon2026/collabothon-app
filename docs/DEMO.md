# Demo script (3–5 min)

Live app: https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com
Every number below was checked on the live app with the real model (Sat 21 Nov, `main` @ 622c733).
If Pair 3's restyle merges, the app is called **MANI** and some labels move; redo the click-through once after that merge.

## Before each run (2 min, Pair 1)

```powershell
Invoke-RestMethod -Method Post -ContentType 'application/json' -Body '{}' https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com/api/demo/reset
```
```powershell
./scripts/demo-duty.ps1
```
The first line of `demo-duty.ps1` must be green: `mode=openai_compat model=llama-32-3b-instruct ok=True`.
Then open the app in a fresh browser window, sign in, and stay on the dashboard. Close other tabs.
Second screen: the OpenShift console with the pods, and the OpenShift AI model page (`my-first-model` → Models).

## The run

| # | Time | Do | Say (short) | You should see |
|---|---|---|---|---|
| 1 | 0:00 | Nothing, login page on screen | "A Polish car repair shop has no CFO. The owner finds out about a cash gap or a tax deadline when it's too late." | Login page |
| 2 | 0:30 | **Sign in** | "Demo login. Everything here is the shop's real-looking data: bank, KSeF invoices, tax dates." | Dashboard |
| 3 | 0:45 | Point at the balance and the forecast | "38 400 zł today. But the forecast says that on 20 December the account goes to **−20 275 zł**, 35 000 below the safety buffer." | **38 400,00 zł**, forecast **−20 275,00 zł** on 20.12 |
| 4 | 1:15 | **Run check now** | "Four AI agents check the shop in the background. Every number comes from code. The model only explains and prioritises." | 12 cards, 0.3 s |
| 5 | 1:30 | Walk through the cards, one line each | Marek (tax, ⚪ white hat): "VAT 14 230 zł due on the 25th, and one KSeF invoice was rejected, he already re-validated it." Anna (cash, ⚫ black hat): "credit line 36 000 zł, reminders to two fleets that owe us 12 300 zł and 7 380 zł." Kasia (FX, 🔴 red hat): "we owe 1 500 EUR, the euro is up 4 weeks in a row: lock the rate." Tomasz (costs, 🟢 green hat): "on 3 orders labour was billed too low, 1 700 zł missing." | Cards marked **Needs approval** / **Recommended** |
| 6 | 2:15 | Chat bubble → type **Is the euro rate a problem?** | "Any question goes to the right agent." | **Kasia** answers in ~1 s: 1 500 EUR, +5 % = 320,25 zł loss, rate 4,22 → 4,27 zł |
| 7 | 2:45 | **Meeting** → topic **Will we survive December?** → **Start meeting** | "The hat conference: each agent speaks with its thinking hat, then the blue-hat chair proposes a plan. This is Llama 3.2 on OpenShift AI, live." | 4 turns: Marek → Anna → Tomasz → Kasia, then the chair. ~5–7 s |
| 8 | 3:30 | **Approvals**: approve **Pay VAT**, the **FlotaTrans reminder**, **Lock the rate**. **Reject** the credit line | "Nothing that moves money or contacts someone runs without the owner's OK. And in this demo everything is simulated." | Balance **38 400 → 24 170 zł** (only VAT moves money). Activity log: 3 × "Simulated …" |
| 9 | 4:15 | Show the **OpenShift AI** badge, then the second screen | "It runs on Red Hat OpenShift, and the model is served by OpenShift AI with vLLM." | Green badge; pods Running; model page |

Total: about 4:30. If short on time, skip step 6.

## Don'ts (known issues tonight)

- **Don't approve or read out "Pay Autoteile Krause GmbH early".** Its own title shows the EUR risk going **up**
  (320,25 → 448,35 zł), and the chair's summary still lists it. Pair 2 is fixing it. Until then, in step 7 talk
  about the VAT and the forward, not the chair's list.
- **Don't say "20 December" is a payday.** It's a Sunday; Pair 3 is moving ZUS/PIT to Monday 21.12.
- Don't click **Reset demo data** in Settings during the demo: it asks for confirmation and wipes the approvals.
- Don't type money questions about numbers that aren't in the data; the agents answer only from the rules.

## If something breaks

| Problem | Who | Do |
|---|---|---|
| Badge not green / the conference shows rule text only | Pair 1 | `./scripts/demo-duty.ps1 -Mock` (9 s). Keep going: "the rules still work without the model." After the demo: `-Real` |
| Page doesn't load | Pair 1 | `oc get pods -n my-first-model`. If the app pod restarts, wait 30 s and reload |
| A bad build went live | Pair 1 | Rollback in `deploy/README.md` section 1 (`oc tag`, not `oc rollout undo`) |
| Wrong numbers after clicking around | Presenter | Reset command above, reload, start from step 3 |

## Timed check (Sat 21 Nov, live app, real model)

reset 0.8 s · login 0.3 s · state 0.1 s · run check 0.3 s (12 cards) · ask 1.1 s (Kasia) · conference 5.2 s ·
approve 0.35 s each · balance after the VAT approval 24 170 zł · reset 0.3 s.
