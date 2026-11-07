from datetime import date, timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

STORE = "clarkston"
TIMEZONE = ZoneInfo("America/Detroit")
TARGETS = ["sales_usd", "order_count"]
COLUMNS = ["store_id", "hour_start", *TARGETS, "status"]
USABLE = {"observed", "confirmed_zero", "closed"}
UNUSABLE = {"missing", "invalid"}
ISO_HOUR = r"\d{4}-\d{2}-\d{2}T\d{2}:00(?::00)?(?:Z|[+-]\d{2}:\d{2})"


def read_history(path: Path) -> tuple[pd.DataFrame, str]:
    raw = path.read_bytes()
    data = pd.read_csv(BytesIO(raw), dtype="string", keep_default_na=False)
    if sorted(data.columns) != sorted(COLUMNS) or not isinstance(data.index, pd.RangeIndex):
        raise ValueError(f"CSV must have exactly these columns: {', '.join(COLUMNS)}")
    if data.empty or not data["store_id"].eq(STORE).all():
        raise ValueError("Provide at least one row, all for store_id=clarkston.")

    if not data["hour_start"].str.fullmatch(ISO_HOUR).all():
        raise ValueError("hour_start must be an ISO 8601 hour with Z or a numeric UTC offset.")
    hours = pd.DatetimeIndex(pd.to_datetime(data["hour_start"], utc=True, format="ISO8601"))
    if not (hours.minute == 0).all() or hours.has_duplicates:
        raise ValueError("Use whole UTC hours and provide only one row per hour.")
    if not data["status"].isin(USABLE | UNUSABLE).all():
        raise ValueError("Unrecognized status. See README for the accepted values.")

    included = data["status"].isin(USABLE)
    if data.loc[~included, TARGETS].ne("").any().any():
        raise ValueError("Missing or invalid rows must leave both targets blank.")
    values = data.loc[included, TARGETS].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(values.to_numpy(dtype=float, na_value=np.nan)).all():
        raise ValueError("Usable rows require finite numeric sales and order counts.")
    orders = values["order_count"]
    if orders.lt(0).any() or orders.mod(1).ne(0).any():
        raise ValueError("Order counts must be nonnegative whole numbers.")
    zero_status = data.loc[included, "status"].isin({"confirmed_zero", "closed"})
    if values.loc[zero_status].ne(0).any().any():
        raise ValueError("Both targets must be zero for closed and confirmed_zero rows.")
    if values.loc[~zero_status].eq(0).all(axis=1).any():
        raise ValueError("Use confirmed_zero or closed when both targets are zero.")

    result = pd.DataFrame(np.nan, index=hours, columns=TARGETS)
    result.iloc[included.to_numpy(dtype=bool)] = values.to_numpy(dtype=float)
    result["status"] = data["status"].to_numpy()
    return result.sort_index(), sha256(raw).hexdigest()


def midnight(day: date) -> pd.Timestamp:
    return pd.Timestamp(day, tz=TIMEZONE).tz_convert("UTC")


def week_hours(day: date) -> pd.DatetimeIndex:
    return pd.date_range(
        midnight(day), midnight(day + timedelta(days=7)), freq="h", inclusive="left"
    )


def demo_data(end_day: date = date(2026, 11, 2)) -> pd.DataFrame:
    hours = pd.date_range(
        midnight(end_day - timedelta(weeks=16)), midnight(end_day), freq="h", inclusive="left"
    )
    rng = np.random.default_rng(42)
    rows = []
    for hour in hours:
        local = hour.tz_convert(TIMEZONE)
        if local.hour not in range(10, 21):
            rows.append((STORE, hour.isoformat(), 0.0, 0, "closed"))
            continue
        lunch = 26 * np.exp(-((local.hour - 12.5) / 1.6) ** 2)
        dinner = 23 * np.exp(-((local.hour - 18) / 1.9) ** 2)
        weekend = 1.24 if local.dayofweek >= 4 else 1.0
        orders = int(rng.poisson((7 + lunch + dinner) * weekend))
        sales = round(orders * rng.uniform(13, 16), 2)
        status = "observed" if orders else "confirmed_zero"
        rows.append((STORE, hour.isoformat(), sales, orders, status))

    return pd.DataFrame(rows, columns=COLUMNS)
