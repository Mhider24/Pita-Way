import argparse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from hourly_data import COLUMNS, STORE, TARGETS, TIMEZONE, midnight

KEY = ["local_date", "local_hour"]
EXPORT_COLUMNS = {"store_id", *KEY, *TARGETS, "export_row_count"}


def read_export(path: Path) -> pd.DataFrame:
    data = pd.read_csv(path, dtype="string", keep_default_na=False, encoding="utf-8-sig")
    if set(data.columns) != EXPORT_COLUMNS or not isinstance(data.index, pd.RangeIndex):
        raise ValueError(f"{path.name}: use the CSV from export_toast_hourly.sql.")
    count = pd.to_numeric(data["export_row_count"], errors="coerce")
    if data.empty or count.isna().any() or not count.eq(len(data)).all():
        raise ValueError(f"{path.name}: empty or incomplete export. Export a smaller date range.")
    if not data["store_id"].eq(STORE).all():
        raise ValueError(f"{path.name}: expected Clarkston rows only.")
    return data


def prepare(exports: list[Path], closed_dates: set[date]) -> tuple[pd.DataFrame, dict]:
    data = pd.concat([read_export(path) for path in exports], ignore_index=True)
    if not data["local_date"].str.fullmatch(r"\d{4}-\d{2}-\d{2}").all():
        raise ValueError("Expected local_date in YYYY-MM-DD format.")
    days = pd.to_datetime(data["local_date"], format="%Y-%m-%d")
    if not data["local_hour"].str.fullmatch(r"(?:[01]?\d|2[0-3])").all():
        raise ValueError("Expected integer local_hour values from 0 through 23.")
    hour = data["local_hour"].astype(int)
    clock = pd.DatetimeIndex(days + pd.to_timedelta(hour, unit="h"))
    if clock.has_duplicates:
        raise ValueError("Duplicate date/hour keys. Check overlapping exports or source duplicates.")

    raw_targets = data[TARGETS].replace({"": pd.NA, "NULL": pd.NA, "null": pd.NA})
    numeric = raw_targets.apply(pd.to_numeric, errors="coerce")
    malformed = raw_targets.notna() & numeric.isna()
    if malformed.any().any() or np.isinf(numeric.to_numpy(dtype=float, na_value=np.nan)).any():
        raise ValueError("The export contains nonnumeric or infinite sales/order values.")
    orders = numeric["order_count"].dropna()
    if orders.lt(0).any() or orders.mod(1).ne(0).any():
        raise ValueError("Order counts must be nonnegative whole numbers.")

    # Check partial rows and ambiguous timestamps before filtering any source values.
    closure_values = numeric.loc[days.dt.date.isin(closed_dates)]
    if closure_values.fillna(0).ne(0).any().any():
        raise ValueError("A supplied closure date has a nonzero sales or order value. Reconcile it first.")

    # The source key has no offset. Do not guess which fall-back hour it represents.
    localized = clock.tz_localize(TIMEZONE, ambiguous="NaT", nonexistent="NaT")
    valid_clock = localized.notna()
    skipped_clock_rows = int((~valid_clock).sum())
    if not valid_clock.any():
        raise ValueError("The export contains no rows with an unambiguous local timestamp.")
    numeric = numeric.loc[valid_clock].astype(float)
    numeric.index = localized[valid_clock].tz_convert("UTC")
    first_day = days.min().date()
    last_day = days.max().date()
    if any(day < first_day or day > last_day for day in closed_dates):
        raise ValueError("A supplied closure date falls outside the export date range.")
    hours = pd.date_range(
        midnight(first_day), midnight(last_day + timedelta(days=1)), freq="h", inclusive="left"
    )
    result = numeric.reindex(hours)
    complete = result[TARGETS].notna().all(axis=1)
    result["status"] = "missing"
    result.loc[hours.isin(numeric.index) & ~complete, "status"] = "invalid"
    result.loc[complete, "status"] = "observed"
    result.loc[result[TARGETS].eq(0).all(axis=1), "status"] = "confirmed_zero"
    result.loc[~complete, TARGETS] = np.nan

    closed_hours = np.isin(hours.tz_convert(TIMEZONE).date, list(closed_dates))
    result.loc[closed_hours, TARGETS] = 0.0
    result.loc[closed_hours, "status"] = "closed"

    result["order_count"] = result["order_count"].astype("Int64")
    result.insert(0, "store_id", STORE)
    result.insert(1, "hour_start", hours.strftime("%Y-%m-%dT%H:%M:%SZ"))
    summary = {
        "start_date": first_day.isoformat(),
        "end_date_inclusive": last_day.isoformat(),
        "exported_rows": len(data),
        "skipped_dst_rows": skipped_clock_rows,
        "hours": len(result),
        "hours_by_status": result["status"].value_counts().to_dict(),
    }
    return result[COLUMNS], summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare read-only Toast hourly exports for training.")
    parser.add_argument("exports", type=Path, nargs="+", help="CSV files from export_toast_hourly.sql.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--closed-dates", type=Path, help="Optional text file with one verified ISO closure date per line."
    )
    args = parser.parse_args()
    try:
        closed_dates = set()
        if args.closed_dates:
            lines = args.closed_dates.read_text(encoding="utf-8-sig").splitlines()
            closed_dates = {date.fromisoformat(line.strip()) for line in lines if line.strip()}
        output, summary = prepare(args.exports, closed_dates)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        output.to_csv(args.output, index=False, mode="x")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Toast import failed: {error}\n")
    print(f"Prepared {args.output}")
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
