# KPI dashboard – API fields needed from Pair 2 (now demo data in `web/src/lib/kpiDemo.ts`)

The new dashboard (Pair 3) shows these numbers. Until the API returns them, the UI uses clearly labelled
demo values ("dane demo"). The UI computes nothing – every value and comparison should come from the rules engine.

| KPI | Field we need | Reference we need |
|---|---|---|
| Revenue formula (week / month) | `carsCount`, `avgJobValuePLN`, `complaintsPLN`, `revenuePLN` | – |
| Cars this week (Tomasz) | `carsCount` | same week last year + delta text |
| Average job value (Tomasz) | `avgJobValuePLN` | same week last year + delta text |
| Margin on tyres and parts (Tomasz) | `partsMarginPct` | plan % + delta text |
| Free cash (Anna) | `kpis.balancePLN` (exists) | same week last year + delta; `daysToCashShortage` |
| Overdue fleet invoices B2B (Anna) | `kpis.overdueReceivablesPLN` (exists) | previous week + delta |
| VAT/ZUS reserve (Marek) | `kpis.nextDeadline` (exists) | – |
| Monthly result | `profitPLN` | same month last year + delta |
| Costs as % of sales | `costSharePct` | plan % + delta |
| Plan vs actual | `revenuePlanPLN`, `planDonePct` | – |
| Trust | `source` per number (`ksef` / `bank` / `workshop` / `rules`), `refreshedAt` | – |

Suggested shape: `GET /api/kpis?period=week|month` → `{ refreshedAt, items: [{ id, owner, value, unit, source, ref: { label, deltaText, good } }] }`.

## Added after the "Plon" review (weekly review, trends, services)

| Feature | Field we need |
|---|---|
| Trend in words for every KPI | `trendText` (e.g. "lepiej niż 3 miesiące temu") per KPI |
| Weekly review (Monday) | `GET /api/review/week` → top 3 `{ owner, severity, title, value, todo, actionId }` ranked by the agents |
| Who owes whom | `kpis.receivablesPLN`, `kpis.payablesPLN` (exist) + `trendText` |
| Profit | `profitPLN` + reference (same month last year) |
| What pays off | `services[]` with `{ name, marginPct }`, best 3 and worst 3 by margin |
| 4-week cash forecast | `GET /api/forecast?days=30` (exists) |

## Added: targets, payment days, cash runway, money lines

| Feature | Field we need |
|---|---|
| Target next to each KPI | `target` per KPI (cars 52, avg job 600 zł, margin 28%) + `deviationText` ("6 aut poniżej celu") |
| How long fleets take to pay | `avgDaysToPay` (fleets), `paymentTermDays` |
| Invoices > 30 days overdue | `overdueOver30Count`, `overdueOver30PLN` |
| Cash runway | `cashRunwayMonths` |
| Biggest cost and its growth | `byCategory[0]` (exists in /api/expenses) + `growthPct` vs last month |

## Printable report (/report)
Uses the same fields as above. Legal updates are static text in `web/src/lib/lawUpdates.ts` (checked 20.11.2026, with sources) –
ideally Pair 1/2 would expose a small `GET /api/law-updates` maintained by the team.

## Everyday-life numbers (added 21.11, from the dashboard storytelling review)

The UI must not compute, so these should come ready from the rules engine (`/api/state` → `kpis`):

| Field | Example | Meaning |
|---|---|---|
| `cashRunwayDays` | `26` | How many days the money lasts with no new income (balance ÷ average daily outflow). |
| `costPer100PLN` | `83` | Out of every 100 zł of sales, how many złoty go to costs this month. |
| `overdueDaysAvg` | `48` | Average number of days the overdue invoices are late. |

Shown next to the big amounts as one plain sentence, e.g. "Cash lasts about 26 days".
