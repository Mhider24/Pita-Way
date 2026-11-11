# Pita Way Labor Forecasting & Scheduling: Developer Guide

What every file does, what goes in and out, what must be true for it to work, and where mock data stands in for real systems. The app implements the screens and rules of the **SRS / Use Case Document (Oct 13 2026)**; use case IDs (UC-n), backlog IDs (PB-n) and open questions (Qn) refer to that document.

---

## 1. How the app works

1. **Sources.** Toast supplies sales, order counts and **actual hours** (time clock). 7shifts supplies **scheduled hours**. Payroll supplies each employee's **home store** and **paid-out store**. Weather is demo data per store and day.
2. **Forecast (UC-6).** A forecast run predicts **sales $ and order count** per hour for a store and date. Each run is saved with its data cutoff and model version and is never overwritten.
3. **Schedule (UC-7).** The forecast plus the store's target SPLH, run through the staffing equation (`RULES.staffingEquation`), gives the staff needed per role and hour. Shifts are built to cover it and **auto-assigned to named employees** (`assignEmployees`); managers can swap names, edit and publish. Crew see only the published, named schedule.
4. **Manager edits (UC-14).** A Store Manager edits a working copy and saves it with a reason. Small changes apply immediately as a new version; larger ones become an **override request (UC-9)** for the District Manager.
5. **Review (UC-10).** The District Manager approves or rejects. An approved request becomes the next version. A request made against an older version can't be approved.
6. **Reporting.** SPLH (UC-8, UC-12) is shown on an explicit actual, scheduled or projected basis, with scheduled-vs-actual hours alongside. The forecast-vs-actual comparison is UC-15. Under-16 hour alerts are UC-11. Minor break violations are logged with weekly tallies and a monthly rollup. Floating employees are detected by comparing payroll with Toast (UC-13).

```
Toast ─┬─ sales, orders ──► forecastFor/actualsFor ──► ForecastRun ──► requiredStaff ──► ScheduleRecommendation (v1, v2…)
       └─ time clock ─┐                                                  ▲ saveAdjustment ≤2h        ▲ reviewOverride (approve)
7shifts ── schedule ──┼─► laborHours ─► SPLH, scheduled vs actual       └─ >2h ─► OverrideRequest ──┘
Payroll ── home/paid ─┴─► floatingEmployees · detectBreakViolations · hourAlerts
```

---

## 2. Requirements to run

| Need | Why |
|---|---|
| Node 20+, `npm install` | Vite 6, Tailwind v4 |
| `npm run dev` → http://localhost:3000 | Port in `vite.config.ts` |
| `npm run build` | `tsc` (strict, no unused locals) then `vite build`. Type errors fail the build. |
| React 19 | shadcn `base-nova` components pass `ref` as a prop |
| Recharts 3 | Required by `components/ui/chart.tsx` |

There's **no backend, no env vars and no persistence**: refreshing the page resets to the seeded data. The app runs on a **mock clock**: Friday Oct 30 2026, 2:00 PM (`data/calendar.ts`).

**Sign-in is makeshift**: email + password against mock credentials in `mock-db.ts`, with no 2FA, hashing or recovery. **Passwords are currently not checked** (`REQUIRE_PASSWORD = false` in `src/state.tsx`) to make testing easier; set it to `true` to enforce them. All demo accounts share the password in `DEMO_PASSWORD` (`src/data/mock-db.ts`). Accounts are listed on the sign-in page: Admin, District Manager (all 6 stores), Store Manager Clarkston, Store Manager Birmingham + Troy, Shift Lead (Leo Brooks), Crew Member (Caleb Khalil, age 15), and an inactive Store Manager (refused). Wrong email and wrong password give the same error.

---

## 3. Configuration

| File | Purpose |
|---|---|
| `package.json` | Scripts and dependencies; every dependency is used |
| `vite.config.ts` / `tsconfig.json` | React + Tailwind plugins; `@` → `src` alias in both |
| `components.json` | shadcn CLI config (`base-nova`, lucide). Add components with `npx shadcn add <name>` |
| `.mcp.json` | shadcn MCP server (optional; the CLI does the same) |
| `src/index.css` | Tailwind, shadcn base CSS, Open Sans, **theme tokens** (light/dark). Colors, radius and font live here only |

---

## 4. Source files

### 4.1 Entry and state

| File | Does |
|---|---|
| `main.tsx` | Mounts `<App />` |
| `App.tsx` | Shows `SignInView` until signed in, then the sidebar shell and the page from `VIEWS` |
| `state.tsx` | The single store (`useApp()`). Holds the mock `Db`, the session, page, location and date, and **every action**. Each action calls `can()` for role and location before changing anything (SRS 5.3) and returns `Result` (`{ok, message}` or `{ok:false, error}`) |

**Store actions**

| Action | Use case | Rule |
|---|---|---|
| `signIn(id)` / `signOut()` | UC-1 | Inactive accounts refused; lands on the first page the role can open |
| `generateForecast(loc, date)` | UC-6 | New run; earlier runs kept; a failed Toast update is added as a limitation |
| `generateRecommendation(loc, date)` | UC-7 | Uses the latest run; keeps manual and override shifts; bumps the version |
| `acceptRecommendation` | UC-7 | Draft → accepted |
| `saveAdjustment(loc, date, shifts, reason, notes)` | UC-14 / UC-9 | Validates shifts. ≤ `adjustmentApproval` limit → applied as a new version; above it → override request |
| `reviewOverride(id, decision, note)` | UC-10 | District access only; refuses already-decided requests and approval of stale ones (base version ≠ current) |
| `requestToastUpdate(loc)` | UC-4 | Mock: Lake Orion fails (403) and keeps its last good data |
| `importSalesCsv(loc, text)` | UC-3 | Partial import; logs a batch |
| `resolveDiscrepancy(id, status)` | UC-13 | Confirm or keep unresolved; never auto-merges |
| `createUser(input)` | UC-2 | Validates name, email, uniqueness and ≥1 location |

### 4.2 Data and logic (`src/data/`)

Pure TypeScript, no React. **Replace mocks here and nothing in the UI needs to change.**

| File | Contents |
|---|---|
| `types.ts` | Every record from the SRS data dictionary: Location, UserAccount, UserLocationAccess, Employee, EmployeeAssignment, SalesInterval (amount + orders), LaborRecord (scheduled/7shifts or actual/Toast, with breaks), PayrollRecord, LaborTarget, ModelVersion, ForecastRun (predicted + predictedOrders), RecShift, ScheduleRecommendation, OverrideRequest, ManualAdjustment, ImportBatch, SourceStatus, Discrepancy, BreakViolation |
| `policies.ts` | `RULES`: all business rule values (staffing equation, under-16 limit and warnings, break rule, approval limit, max daily hours). Decisions and items still to confirm: [OPEN_DECISIONS.md](OPEN_DECISIONS.md) |
| `calendar.ts` | Mock clock (`TODAY`, `NOW_SLOT`), `HOURS` (staffed day 9 AM–10 PM in hourly slots), **`OPERATING_HOURS`** (Mon–Sat 10:30 AM–9:30 PM, Sun 11 AM–8 PM), `openShare` / `staffedSlots` (1h prep before opening, 30 min close-down after), `DATES` (three weeks: last, this, next), formatting helpers |
| `mock-db.ts` | `seedDb()`: the stand-in for Toast, 7shifts, payroll and the app database. Seeds realistic data problems (missing clock-out, missing breaks, an unmatched or uncertain employee, a duplicate row, a failed Toast store, floating employees, a break violation) |
| `forecast.ts` | `predictSales` (demo model), `weatherFor` / `weatherLabel` (demo weather), `makeForecastRun`, `latestRun`, `actualsFor(…, 'sales' \| 'orders')`, `compareForecast` (hourly WAPE, total error, incomplete/missing hours) |
| `staffing.ts` | `requiredStaff` (equation + staffing notes), `buildShifts`, `assignEmployees` (named, split shifts ≤ 8h, minors ≤ 4.5h), `validateSchedule` (overlaps, under-16 limit), `addCoverage` / `removeCoverage`, `validateShift`, `changeSummary` ("+1 Line Cook, 5 PM–9 PM"), chart rows |
| `labor.ts` | `laborHours` (UC-12: per-hour allocation, unpaid breaks removed, incomplete records reported), `splhReport` (UC-8: sales and hours over the same hours; "unavailable" with a reason), `scheduledVsActual` |
| `alerts.ts` | `hourAlerts` (UC-11, hours summed across stores), `detectBreakViolations` (from Toast punches), `tallyViolations` (week/month), `weekOf` |
| `employees.ts` | `floatingEmployees`: payroll home store vs stores worked in Toast, and payroll paid-out store vs worked store |
| `imports.ts` | `parseSalesCsv`: provisional CSV `interval_start,sales_amount,order_count` |
| `permissions.ts` | `can(user, action, access, locationId?)`, role → action matrix, `ROLE_LABEL` |

### 4.3 Views (`src/views/`), one per SRS screen (4.2)

| File | Screen / use cases | Who |
|---|---|---|
| `sign-in.tsx` | Sign in (UC-1) | everyone |
| `dashboard.tsx` | Source freshness; forecast sales and orders; actual sales to date; **actual vs scheduled hours**; projected SPLH; needs-attention list; all assigned locations | Managers |
| `forecast.tsx` | Run metadata and limitations; **Sales $ / Order count** toggle; Hourly, Daily, **Compare with actual** (UC-15) and Run history tabs | Managers |
| `schedule.tsx` | Recommendation, conflicts, version and status; headcount grid; role slots; edit mode → save with reason (UC-14/UC-9); change history | SM edits; DM views |
| `splh.tsx` | SPLH by basis; **scheduled (7shifts) vs actual (Toast)** hours per hour; incomplete labor records | Managers |
| `overrides.tsx` | Pending/decided requests, impact, stale warning, approve/reject (UC-9, UC-10) | SM: own; DM: review |
| `alerts.tsx` | Under-16 hour alerts (UC-11); **break violations**: weekly log, weekly tally, monthly rollup | Managers |
| `data.tsx` | Source status and Toast update (UC-4); CSV import and history (UC-3); labor records (UC-5); **floating employees** and discrepancies (UC-13) | Admin |
| `users.tsx` | Accounts and create account (UC-2) | Admin |

### 4.4 Components (`src/components/`)

| File | Purpose |
|---|---|
| `app-sidebar.tsx` | `NAV` (filtered by `canOpen`), badges (pending requests, alerts, open discrepancies), user menu with sign-out |
| `site-header.tsx` | Page title; location (assigned only) and date selectors |
| `day-strip.tsx` | Week of day buttons with store hours and prev/next week arrows; sets the app date |
| `shift-timeline.tsx` | Named day view: one row per shift grouped by role, bars across opening hours; highlights the signed-in employee; clickable in edit mode |
| `result-alert.tsx` | Shows an action `Result` |
| `metric-card.tsx`, `page-title.tsx`, `form-select.tsx` | Layout helpers on top of shadcn |
| `charts.tsx` | `SalesChart` (money or orders), `StaffingChart` |
| `headcount-grid.tsx` | Role × hour matrix; +/− only in edit mode |
| `shift-dialog.tsx` | Edit one role slot (working copy) |
| `adjustment-dialog.tsx` | Save changes with a reason; previews "applies immediately" vs "needs approval" |
| `ui/*` | shadcn components. Add/update via CLI only |

---

## 5. Roles

| Capability | Admin | District Mgr | Store Mgr | Shift Lead / Crew |
|---|---|---|---|---|
| Users, data import & review | ✓ | – | – | – |
| Forecast, SPLH, alerts, dashboard | – | ✓ (district stores) | ✓ (own stores) | – |
| Generate forecast | – | ✓ | ✓ | – |
| Edit, swap names, publish schedule | – | – | ✓ (today and future) | – |
| Request override | – | – | ✓ | – |
| Review override | – | ✓ | – | – |
| Own store's schedule (read-only) | – | ✓ | ✓ | ✓ |
| Under-16 tracker and break violations | – | ✓ | ✓ | Shift Lead only (read-only) |

These are enforced in `state.tsx` actions, not only by hiding buttons. A real backend must enforce the same rules (e.g. Azure backend).

---

## 6. Demo data and what replaces it

Rule values are in `RULES` (`src/data/policies.ts`); decisions and items still to confirm are in [OPEN_DECISIONS.md](OPEN_DECISIONS.md). Everything below is demo data that a real integration replaces:

| Demo piece | Where | Replace with |
|---|---|---|
| Sign-in (password check off) | `state.signIn`, `REQUIRE_PASSWORD`, `credentials` in `mock-db.ts` | Real authentication with hashed passwords and 2FA |
| All source data | `seedDb()` | Toast API (sales, orders, time clock), 7shifts API, payroll export |
| Clock (Fri Oct 30, 2 PM) | `calendar.ts` | Store-timezone current time |
| Forecast model | `predictSales`, `MODEL_VERSION` | Trained model with versioning and backtesting |
| Weather | `weatherFor` | Weather provider per store location |
| Store targets ($70–$88 SPLH) | `TARGET_SPLH` in `mock-db.ts` | Client labor targets |
| Break-violation history (Sep–Oct) | `seedViolationHistory` | Stored violation log |
| Persistence | `useState` in `state.tsx` | Backend + database |

### Integration checklist

1. Keep the record shapes in `types.ts` and the function signatures in `data/*.ts`. Swap `seedDb()` for API loads.
2. Move permission checks server-side; keep `can()` for UI hints.
3. Make store actions async (loading and error states via shadcn `skeleton` and `alert`).
4. Change rule values only in `RULES`.
5. Run `npm run build` and walk all roles (SRS validation checks V1–V16).

---

## 7. Common tasks

| Task | How |
|---|---|
| Add a shadcn component | `npx shadcn search @shadcn -q <name>` → `npx shadcn docs <name>` → `npx shadcn add <name>` |
| Change a rule value | Edit `data/policies.ts` |
| Add a page | `Page` + `PAGE_ACTION` in `state.tsx`, an entry in `NAV`, a view in `App.tsx` `VIEWS` |
| Add a role or permission | `Role` in `types.ts`, `MATRIX` and `ROLE_LABEL` in `permissions.ts` |
| Add a station | `Station` in `types.ts`, `STATIONS`, `requiredStaff`, `staffRows`, chart config |
