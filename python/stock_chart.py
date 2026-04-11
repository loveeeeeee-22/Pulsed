"""
Toy OHLC series + three-pane chart (make_subplots): candlesticks (graph_objects),
Close + SMA via Plotly Express line, RSI panel (graph_objects).

Venv: python3 -m venv .venv && source .venv/bin/activate  # macOS/Linux
     .venv\\Scripts\\activate  # Windows
"""

from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

RNG = random.Random(42)
# Enough history that SMA(20) draws as a line, not a single point.
N_DAYS = 60
START_PRICE = 100.0
OHLC_COLS = ("Open", "High", "Low", "Close")
SMA_PERIOD = 20
RSI_PERIOD = 14
# Simulated “live” arrivals after the static seed history.
LIVE_STREAM_DAYS = 5


def _ohlc_from_previous_close(prev_close: float, rng: random.Random) -> tuple[float, float, float, float]:
    """Single bar: open anchored near prev close, close correlated via intraday move."""
    open_ = round(prev_close + rng.uniform(-0.45, 0.45), 2)
    close = round(open_ + rng.uniform(-2.0, 2.0), 2)
    body_hi = max(open_, close)
    body_lo = min(open_, close)
    high = round(body_hi + rng.uniform(0.05, 1.1), 2)
    low = round(body_lo - rng.uniform(0.05, 1.1), 2)
    return open_, high, low, close


def append_simulated_day(
    df: pd.DataFrame,
    rng: random.Random,
    *,
    date_step: timedelta | pd.offsets.BaseOffset = pd.offsets.BDay(1),
) -> pd.DataFrame:
    """
    Append one row: index advances by one trading day (default) or a fixed timedelta.
    OHLC is mildly tied to the previous bar's close (via open gap + intraday noise).
    """
    if df.empty:
        raise ValueError("DataFrame must have at least one row before appending.")
    if not isinstance(df.index, pd.DatetimeIndex):
        raise TypeError("Expected a DatetimeIndex on df.")

    prev_close = float(df["Close"].iloc[-1])
    last_ts = pd.Timestamp(df.index[-1])
    if isinstance(date_step, timedelta):
        next_ts = last_ts + date_step
    else:
        next_ts = last_ts + date_step

    open_, high, low, close = _ohlc_from_previous_close(prev_close, rng)
    bar = pd.DataFrame(
        [[open_, high, low, close]],
        index=pd.DatetimeIndex([next_ts], name=df.index.name),
        columns=list(OHLC_COLS),
    )
    return pd.concat([df, bar])


def _build_ohlc_rows() -> list[dict[str, float | str]]:
    # Anchor from start so periods=20 always yields 20 rows (end= weekend can drop one).
    dates = pd.bdate_range(start="2026-03-17", periods=N_DAYS)
    date_strs = dates.strftime("%Y-%m-%d").tolist()

    rows: list[dict[str, float | str]] = []
    prev_close = START_PRICE

    for d in date_strs:
        open_, high, low, close = _ohlc_from_previous_close(prev_close, RNG)
        rows.append(
            {
                "Date": d,
                "Open": open_,
                "High": high,
                "Low": low,
                "Close": close,
            }
        )
        prev_close = close

    return rows


def prepare_ohlc_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["Date"] = pd.to_datetime(out["Date"], format="%Y-%m-%d")
    out = out.set_index("Date").sort_index()
    out = out.apply(pd.to_numeric, errors="raise")
    return out


def compute_rsi(close: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    """14-day RSI using Wilder smoothing (matches typical trading defaults)."""
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["SMA_20"] = out["Close"].rolling(window=SMA_PERIOD, min_periods=SMA_PERIOD).mean()
    out["RSI_14"] = compute_rsi(out["Close"], RSI_PERIOD)
    return out


@dataclass(frozen=True)
class TradeEvent:
    """One replayable item at a bar timestamp (Phase 3 blueprint)."""

    event_type: Literal["signal"]
    side: Literal["BUY", "SELL", "HOLD"]
    price: float | None
    details: str


def append_event(
    evmap: defaultdict[pd.Timestamp, list[TradeEvent]],
    ts: pd.Timestamp | object,
    event: TradeEvent,
) -> None:
    """Append an event using a key aligned with ``df.index`` (typically daily midnight)."""
    key = pd.Timestamp(ts)
    evmap[key].append(event)


def build_trade_event_map(df: pd.DataFrame) -> dict[pd.Timestamp, list[TradeEvent]]:
    """
    Map each bar timestamp to zero or more events (e.g. multiple signals same day).
    Requires ``RSI_{RSI_PERIOD}`` on ``df``. SELL uses RSI cross above 70; MACD can be added later.
    """
    rsi_col = f"RSI_{RSI_PERIOD}"
    if rsi_col not in df.columns:
        raise KeyError(f"DataFrame must include {rsi_col!r} (run add_technical_indicators first).")

    rsi = df[rsi_col]
    rsi_prev = rsi.shift(1)
    close = df["Close"]

    buy_x = rsi_prev.notna() & rsi.notna() & (rsi_prev >= 30.0) & (rsi < 30.0)
    sell_x = rsi_prev.notna() & rsi.notna() & (rsi_prev <= 70.0) & (rsi > 70.0)

    raw: defaultdict[pd.Timestamp, list[TradeEvent]] = defaultdict(list)
    for ts in df.index:
        if not isinstance(ts, pd.Timestamp):
            ts = pd.Timestamp(ts)
        if bool(buy_x.loc[ts]):
            append_event(
                raw,
                ts,
                TradeEvent(
                    event_type="signal",
                    side="BUY",
                    price=float(close.loc[ts]),
                    details="Triggered by RSI crossing below 30.",
                ),
            )
        if bool(sell_x.loc[ts]):
            append_event(
                raw,
                ts,
                TradeEvent(
                    event_type="signal",
                    side="SELL",
                    price=float(close.loc[ts]),
                    details="Triggered by RSI crossing above 70 (MACD crossover placeholder TBD).",
                ),
            )

    all_keys = [pd.Timestamp(t) for t in df.index]
    ordered = {k: list(raw[k]) for k in all_keys}
    return ordered


def _tooltip_customdata(df: pd.DataFrame, sma_col: str, rsi_col: str) -> list[list[str]]:
    """One row per bar: [O, H, L, C, SMA, RSI] as display strings for linked hovers."""
    rows: list[list[str]] = []
    for _, r in df.iterrows():
        sma = r[sma_col]
        rsi = r[rsi_col]
        rows.append(
            [
                f"{r['Open']:.2f}",
                f"{r['High']:.2f}",
                f"{r['Low']:.2f}",
                f"{r['Close']:.2f}",
                f"{sma:.2f}" if pd.notna(sma) else "—",
                f"{rsi:.2f}" if pd.notna(rsi) else "—",
            ]
        )
    return rows


def build_candlestick_figure(df: pd.DataFrame) -> go.Figure:
    """Three aligned panes: OHLC (go), Close + SMA (px.line), RSI (go)."""
    sma_col = f"SMA_{SMA_PERIOD}"
    rsi_col = f"RSI_{RSI_PERIOD}"
    tooltip_cd = _tooltip_customdata(df, sma_col, rsi_col)

    _ht_candle = (
        "<b>%{x|%Y-%m-%d}</b><br>"
        "Open %{open:.2f} &nbsp; High %{high:.2f}<br>"
        "Low %{low:.2f} &nbsp; Close %{close:.2f}<br>"
        "<b>Indicators</b> SMA %{customdata[4]} &nbsp; RSI %{customdata[5]}"
        "<extra></extra>"
    )
    _ht_close = (
        "<b>%{x|%Y-%m-%d}</b> · Close<br>"
        "OHLC O %{customdata[0]} H %{customdata[1]} L %{customdata[2]} C %{customdata[3]}<br>"
        "SMA %{customdata[4]} &nbsp; RSI %{customdata[5]}"
        "<extra></extra>"
    )
    _ht_sma = (
        "<b>%{x|%Y-%m-%d}</b> · SMA<br>"
        "OHLC O %{customdata[0]} H %{customdata[1]} L %{customdata[2]} C %{customdata[3]}<br>"
        "SMA %{customdata[4]} &nbsp; RSI %{customdata[5]}"
        "<extra></extra>"
    )
    _ht_rsi = (
        "<b>%{x|%Y-%m-%d}</b> · RSI<br>"
        "RSI %{y:.2f}<br>"
        "OHLC O %{customdata[0]} H %{customdata[1]} L %{customdata[2]} C %{customdata[3]}<br>"
        "SMA %{customdata[4]} &nbsp; RSI %{customdata[5]}"
        "<extra></extra>"
    )

    fig = make_subplots(
        rows=3,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.05,
        row_heights=[0.46, 0.32, 0.22],
        subplot_titles=("OHLC", "Close vs SMA", "RSI"),
    )

    fig.add_trace(
        go.Candlestick(
            x=df.index,
            open=df["Open"],
            high=df["High"],
            low=df["Low"],
            close=df["Close"],
            name="OHLC",
            increasing_line_color="#26a69a",
            decreasing_line_color="#ef5350",
        ),
        row=1,
        col=1,
    )

    mid = px.line(
        df.reset_index(),
        x="Date",
        y=["Close", sma_col],
        labels={"value": "Price", "Date": "Date"},
    )
    for trace in mid.data:
        fig.add_trace(trace, row=2, col=1)

    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["RSI_14"],
            mode="lines",
            name=f"RSI {RSI_PERIOD}",
            line=dict(color="#ab47bc", width=2),
            connectgaps=False,
        ),
        row=3,
        col=1,
    )
    fig.add_hline(
        y=70,
        line_dash="dash",
        line_color="rgba(120,120,120,0.6)",
        row=3,
        col=1,
    )
    fig.add_hline(
        y=30,
        line_dash="dash",
        line_color="rgba(120,120,120,0.6)",
        row=3,
        col=1,
    )

    fig.update_layout(
        title=f"Multi-pane: OHLC | Close + SMA({SMA_PERIOD}) | RSI({RSI_PERIOD}) — {len(df)} sessions",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        xaxis_rangeslider_visible=False,
    )
    fig.update_xaxes(rangeslider_visible=False, row=1, col=1)

    fig.update_yaxes(title_text="Price", row=1, col=1, tickformat=".2f")
    fig.update_yaxes(title_text="Price", row=2, col=1, tickformat=".2f")
    fig.update_yaxes(title_text="RSI", row=3, col=1, range=[0, 100])

    fig.update_xaxes(showticklabels=False, row=1, col=1)
    fig.update_xaxes(showticklabels=False, row=2, col=1)
    fig.update_xaxes(title_text="Date", tickangle=-45, row=3, col=1)

    # Same customdata on every trace so each tooltip shows OHLC + SMA + RSI for that date.
    fig.data[0].update(customdata=tooltip_cd, hovertemplate=_ht_candle)
    fig.data[1].update(customdata=tooltip_cd, hovertemplate=_ht_close)
    fig.data[2].update(customdata=tooltip_cd, hovertemplate=_ht_sma)
    fig.data[3].update(customdata=tooltip_cd, hovertemplate=_ht_rsi)

    for row in (1, 2, 3):
        fig.update_xaxes(
            showspikes=True,
            spikecolor="rgba(60,60,60,0.35)",
            spikethickness=1,
            spikemode="across",
            spikesnap="cursor",
            row=row,
            col=1,
        )

    return fig


def main() -> None:
    df = pd.DataFrame(_build_ohlc_rows())
    df = prepare_ohlc_dataframe(df)

    stream_rng = random.Random(123)
    for i in range(LIVE_STREAM_DAYS):
        df = append_simulated_day(df, stream_rng)
        last = df.iloc[-1]
        print(
            f"live tick {i + 1}/{LIVE_STREAM_DAYS} | "
            f"date={df.index[-1].date()} | "
            f"O={last['Open']:.2f} H={last['High']:.2f} L={last['Low']:.2f} C={last['Close']:.2f}"
        )

    df = add_technical_indicators(df)
    assert isinstance(df.index, pd.DatetimeIndex)
    assert df.index.is_monotonic_increasing
    assert df[list(OHLC_COLS)].apply(pd.api.types.is_numeric_dtype).all()

    event_map = build_trade_event_map(df)
    n_events = sum(len(evts) for evts in event_map.values())
    bars_with_events = [ts for ts, evts in event_map.items() if evts]
    print(
        f"trade_event_map: {len(event_map)} bar keys, {n_events} total events, "
        f"{len(bars_with_events)} bars with at least one event"
    )
    if bars_with_events:
        first_ts, last_ts = bars_with_events[0], bars_with_events[-1]
        print(f"  first event bar: {first_ts.date()} ({len(event_map[first_ts])} event(s))")
        print(f"  last event bar:  {last_ts.date()} ({len(event_map[last_ts])} event(s))")
        sample = event_map[first_ts][0]
        print(f"  sample event: {sample.side} @ {sample.price} — {sample.details}")

    print(df.to_string())

    fig = build_candlestick_figure(df)
    fig.show()


if __name__ == "__main__":
    main()
