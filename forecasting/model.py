import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits

from hourly_data import TARGETS, TIMEZONE

LAG_WEEKS = (1, 2, 3, 4)
METHODS = ("baseline", "candidate")
MODEL_CHOICES = ("sklearn", "xgboost")


def local_clock(hours: pd.DatetimeIndex) -> pd.DatetimeIndex:
    return hours.tz_convert(TIMEZONE).tz_localize(None)


def features(hours: pd.DatetimeIndex, history: pd.DataFrame) -> pd.DataFrame:
    clock = local_clock(hours)
    result = pd.DataFrame(
        {
            "hour": clock.hour,
            "weekday": clock.dayofweek,
            "hour_of_week": clock.dayofweek * 24 + clock.hour,
            "month": clock.month,
        },
        index=hours,
    )
    # Both occurrences of a fall-back hour contribute to its local-hour profile.
    by_wall_clock = history[TARGETS].groupby(local_clock(history.index)).mean()
    for weeks in LAG_WEEKS:
        lag = by_wall_clock.reindex(clock - pd.Timedelta(weeks=weeks))
        for target in TARGETS:
            result[f"{target}_lag_{weeks}w"] = lag[target].to_numpy()
    return result


def new_regressor(model_name: str):
    if model_name == "xgboost":
        try:
            from xgboost import XGBRegressor
        except ImportError as error:
            raise ValueError(
                "Install the XGBoost dependencies from forecasting/requirements-xgboost.txt."
            ) from error
        return XGBRegressor(
            objective="reg:squarederror",
            tree_method="hist",
            device="cpu",
            n_estimators=150,
            max_depth=4,
            learning_rate=0.1,
            n_jobs=2,
            random_state=42,
        )
    return HistGradientBoostingRegressor(
        max_iter=150,
        max_leaf_nodes=15,
        l2_regularization=1.0,
        early_stopping=False,
        random_state=42,
    )


def fit(history: pd.DataFrame, model_name: str = "sklearn") -> dict:
    observed = history.dropna(subset=TARGETS)
    if len(observed) < 168 or observed.index[-1] - observed.index[0] < pd.Timedelta(weeks=4):
        raise ValueError("Each training window needs over four weeks of history and 168 usable hours.")

    inputs = features(observed.index, history)
    models = {}
    with threadpool_limits(limits=2):
        for target in TARGETS:
            model = new_regressor(model_name)
            models[target] = model.fit(inputs, observed[target])
    return models


def predict(hours: pd.DatetimeIndex, history: pd.DataFrame, models: dict) -> pd.DataFrame:
    inputs = features(hours, history)
    result = pd.DataFrame(index=hours)
    clock = local_clock(history.index)
    result["comparable_weeks"] = inputs[
        [f"sales_usd_lag_{weeks}w" for weeks in LAG_WEEKS]
    ].notna().sum(axis=1)
    for target in TARGETS:
        lags = inputs[[f"{target}_lag_{weeks}w" for weeks in LAG_WEEKS]]
        # Use the nearest usable matching hour, then the older same-slot median.
        seasonal = history[target].groupby(clock.dayofweek * 24 + clock.hour).median()
        fallback = inputs["hour_of_week"].map(seasonal).fillna(history[target].median())
        result[f"baseline_{target}"] = lags.bfill(axis=1).iloc[:, 0].fillna(fallback)
        with threadpool_limits(limits=2):
            result[f"candidate_{target}"] = models[target].predict(inputs)
    for method in METHODS:
        result[f"{method}_order_count"] = result[f"{method}_order_count"].clip(lower=0)
    return result


def error_metrics(actual: pd.Series, estimate: pd.Series) -> dict:
    if actual.empty:
        return {"n": 0, "mae": None, "wape_pct": None, "bias": None}
    error = estimate - actual
    volume = actual.abs().sum()
    return {
        "n": len(actual),
        "mae": round(float(error.abs().mean()), 4),
        "wape_pct": round(float(100 * error.abs().sum() / volume), 4) if volume else None,
        "bias": round(float(error.mean()), 4),
    }


def scores(comparison: pd.DataFrame) -> dict:
    actuals = comparison.dropna(subset=TARGETS)
    clock = local_clock(comparison.index)
    expected_daily = comparison.groupby(clock.date).size()
    actual_days = local_clock(actuals.index).date
    complete_days = actuals.groupby(actual_days).size().reindex(expected_daily.index)
    complete_days = expected_daily.index[complete_days.eq(expected_daily)]
    daily = actuals.select_dtypes("number").groupby(actual_days).sum().reindex(complete_days)
    return {
        "expected_hours": len(comparison),
        "scored_hours": len(actuals),
        "expected_days": len(expected_daily),
        "scored_days": len(daily),
        "methods": {
            method: {
                target: {
                    "hourly": error_metrics(actuals[target], actuals[f"{method}_{target}"]),
                    "daily": error_metrics(daily[target], daily[f"{method}_{target}"]),
                }
                for target in TARGETS
            }
            for method in METHODS
        },
    }
