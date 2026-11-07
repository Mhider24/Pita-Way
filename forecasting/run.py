import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import joblib
import pandas as pd

from hourly_data import STORE, TARGETS, TIMEZONE, demo_data, midnight, read_history, week_hours
from model import fit, predict, scores

VERSION = "0.1.0"


def write_csv(frame: pd.DataFrame, path: Path) -> None:
    output = frame.copy()
    output.insert(0, "store_id", STORE)
    output.insert(1, "hour_start_utc", output.index.map(lambda hour: hour.isoformat()))
    local_hours = output.index.tz_convert(TIMEZONE)
    output.insert(2, "hour_start_local", local_hours.map(lambda hour: hour.isoformat()))
    output.to_csv(path, index=False, float_format="%.6f")


def execute(
    input_path: Path, output_root: Path, start: date | None, folds: int, synthetic: bool
) -> Path:
    source, digest = read_history(input_path)
    usable = source.dropna(subset=TARGETS)
    if usable.empty:
        raise ValueError("The CSV has no usable observations.")
    if start is None:
        start = usable.index[-1].tz_convert(TIMEZONE).date() + timedelta(days=1)
    cutoff = midnight(start)
    history = source.loc[source.index < cutoff]
    recent_start = midnight(start - timedelta(days=1))
    recent = history.loc[history.index >= recent_start]
    recent_usable = int(recent[TARGETS[0]].notna().sum())
    if not recent_usable:
        raise ValueError("The local date immediately before the forecast needs usable history.")

    evaluation_rows = []
    windows = []
    for weeks in range(folds, 0, -1):
        fold_start = start - timedelta(weeks=weeks)
        hours = week_hours(fold_start)
        past = history.loc[history.index < hours[0]]
        predictions = predict(hours, past, fit(past))
        comparison = predictions.join(history.reindex(hours))
        comparison["status"] = comparison["status"].fillna("omitted")
        comparison.insert(0, "forecast_start_local_date", fold_start.isoformat())
        windows.append({
            "start_date": fold_start.isoformat(),
            "training_cutoff_utc_exclusive": hours[0].isoformat(),
            **scores(comparison),
        })
        evaluation_rows.append(comparison)
    evaluation = pd.concat(evaluation_rows)
    if evaluation[TARGETS[0]].notna().sum() == 0:
        raise ValueError("No usable actuals in the evaluation windows.")

    models = fit(history)
    forecast = predict(week_hours(start), history, models)
    created = datetime.now(timezone.utc)
    run_id = f"{created:%Y%m%dT%H%M%SZ}-{uuid4().hex[:10]}"
    report = {
        "run_id": run_id,
        "starter_version": VERSION,
        "created_utc": created.isoformat(),
        "store_id": STORE,
        "timezone": TIMEZONE.key,
        "input_kind": "synthetic" if synthetic else "provided_csv",
        "input_sha256": digest,
        "training_cutoff_utc_exclusive": cutoff.isoformat(),
        "training_usable_hours": int(history[TARGETS[0]].notna().sum()),
        "prior_day_usable_hours": recent_usable,
        "prior_day_expected_hours": int((cutoff - recent_start) / pd.Timedelta(hours=1)),
        "forecast_start_date": start.isoformat(),
        "forecast_end_date_exclusive": (start + timedelta(days=7)).isoformat(),
        "forecast_hours": len(forecast),
        "forecast_hours_without_recent_comparable": int(forecast["comparable_weeks"].eq(0).sum()),
        "backtest": {"overall": scores(evaluation), "windows": windows},
    }

    output_root.mkdir(parents=True, exist_ok=True)
    final = output_root / run_id
    with TemporaryDirectory(prefix=".staging-", dir=output_root) as temporary:
        staged = Path(temporary) / run_id
        staged.mkdir()
        write_csv(forecast, staged / "forecast.csv")
        write_csv(evaluation, staged / "backtest.csv")
        (staged / "metrics.json").write_text(
            json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
        )
        joblib.dump(models, staged / "model.joblib")
        if synthetic:
            (staged / "synthetic_input.csv").write_bytes(input_path.read_bytes())
        staged.rename(final)
    return final


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and backtest the Clarkston hourly forecast.")
    parser.add_argument("--output", type=Path, default=Path("runs"))
    parser.add_argument("--folds", type=int, default=4, help="Number of weekly backtest windows.")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run the full pipeline on generated sample data.")
    real = subcommands.add_parser("run", help="Run on an approved, normalized hourly CSV.")
    real.add_argument("--input", type=Path, required=True)
    real.add_argument(
        "--start-date", type=date.fromisoformat,
        help="First local forecast date (default: day after the latest usable input date).",
    )
    args = parser.parse_args()
    if args.folds < 1:
        parser.error("--folds must be at least 1.")
    try:
        if args.command == "demo":
            with TemporaryDirectory() as directory:
                sample = Path(directory) / "synthetic.csv"
                demo_data().to_csv(sample, index=False)
                result = execute(sample, args.output, None, args.folds, synthetic=True)
        else:
            result = execute(args.input, args.output, args.start_date, args.folds, synthetic=False)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Forecast run failed: {error}\n")
    print(f"Forecast, backtest, metrics and fitted model saved to {result}")


if __name__ == "__main__":
    main()
