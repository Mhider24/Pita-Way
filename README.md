# Pita Way Staffing App

## Clarkston demand forecast

This starter forecasts **hourly sales dollars and order counts** for seven local
calendar days. It compares a seasonal baseline with two gradient-boosted tree
models (one per target). It runs locally on a CPU with Python 3.12.

### Run the demo

From the repository root:

```sh
python -m venv .venv
```

In PowerShell, run `.\.venv\Scripts\Activate.ps1`. On macOS/Linux, run `source .venv/bin/activate`. If activation is
blocked on Windows, use `.\.venv\Scripts\python.exe` in place of `python`
in the commands below.

```sh
python -m pip install -r forecasting/requirements.txt
python forecasting/run.py demo
```

The demo uses generated data. Its error scores measure the demo only.

### Run on approved Clarkston data

Run [export_toast_hourly.sql](forecasting/export_toast_hourly.sql) in the Azure
SQL Query editor using an individual read-only database account. Download the
results as CSV and save them under the ignored `data/` directory. The query uses
the Toast `hourly` table for the demand targets. The combined `v_store_hour`
view is useful for labor and sales comparisons. Scheduled hours from 7shifts
belong to the staffing stage.

```sh
python forecasting/prepare_toast.py data/clarkston_toast.csv --output data/clarkston_hourly.csv
python forecasting/run.py run --input data/clarkston_hourly.csv
```

If the import reports an incomplete export, run the SQL for smaller,
nonoverlapping date ranges and pass each resulting CSV as a positional input to
`prepare_toast.py`. The import reports the date range and counts by hour status.
Check that the date range matches the intended export before training. An
existing output file is preserved. Use a new output filename for a new snapshot.

The sales target is the source's hourly net sales before refunds. Confirm the
definition with the team before comparing against totals from another source.
Review unusual days and gift-card activity before agreeing on any adjustments.
The import preserves the source values. Absent hours stay unavailable. For
verified closures, supply an optional local text file with one ISO date per line
using `--closed-dates`. A local source hour that cannot be placed on the UTC
timeline unambiguously is reported and skipped. If only some hours are scored,
read the hourly errors with their coverage. Daily metrics require complete days.

If you already have a normalized hourly CSV, you can run it directly:

```sh
python forecasting/run.py run --input data/clarkston_hourly.csv
```

The default forecast starts at local midnight after the latest usable input
date. Use `--start-date YYYY-MM-DD` after `run` to set the first forecast
day explicitly. Provide data through the preceding local day and check prior-day
coverage in the report. Run the same command with a refreshed export to retrain
and create a new run. Four weekly backtests are the default. Set a different
count with `--folds N` before `run` or `demo`. The earliest training window
needs more than four weeks of history and at least 168 usable hourly rows, so
plan for over eight weeks of history with the default settings.

### Hourly input contract

```csv
store_id,hour_start,sales_usd,order_count,status
clarkston,2026-10-31T12:00:00-04:00,526.43,31,observed
clarkston,2026-10-31T13:00:00-04:00,,,missing
clarkston,2026-10-31T14:00:00-04:00,0,0,confirmed_zero
clarkston,2026-10-31T23:00:00-04:00,0,0,closed
```

- Use one row per real hour and an explicit UTC offset or `Z` on every
  timestamp. Local calendar days use `America/Detroit`. Keep both fall-back
  hours with their distinct offsets.
- Use the team's agreed hourly sales definition and order-count rules
  consistently. Sales may be negative if the agreed definition permits refunds.
  Order counts must be nonnegative integers.
- Only record `closed` or `confirmed_zero` with verified zero sales and orders.
  Leave both targets blank for `missing` or `invalid`. Gaps are treated as
  unavailable. The adapter should preserve the difference between source gaps
  and a confirmed closure when preparing the export.
- Keep approved data, generated runs and vendor credentials outside tracked Git files.

### Read the results

Each run writes a separate directory under `runs/`:

| File | Contents |
| --- | --- |
| `forecast.csv` | The baseline and candidate predictions per hour, UTC and local timestamps, and the number of comparable hours available from the preceding four weeks. Fractional predicted orders represent expected demand. |
| `backtest.csv` | Both methods' predictions beside observed actuals and input status for the historical test windows. |
| `metrics.json` | Input fingerprint, training cutoff, coverage, and hourly and daily MAE, WAPE and bias overall and per test window. Daily metrics use complete local days only. WAPE is unavailable when actual volume is zero. |
| `model.joblib` | The fitted candidate estimators for the run. Reproducing their inputs requires the corresponding historical CSV and feature code. |
| `synthetic_input.csv` | The generated input for a demo run. |

Each backtest fits using records available before that week's cutoff. The
baseline starts with the same local hour a week earlier, then looks back up
to four weeks before falling back to historical medians. The candidate learns
from calendar fields and historical lags. Both methods use the same hourly
actuals for scoring. A seven-day forecast can contain 167, 168 or 169 hours,
depending on daylight saving time.

The starter runs manually and writes candidate results for review. Automatic
refresh, model promotion, Azure storage, verified future closures and staffing
recommendations are later integration steps.
