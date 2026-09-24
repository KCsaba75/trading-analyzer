"""
YFinance Proxy + Indicator Calculator
A Frontend hívja ezt a szervert (CORS miatt), ami:
1. Lekéri a YFinance adatokat (15m-es idősor)
2. Kiszámolja a 10 indikátort
3. Jev AI-nak küldi a szavazatot
4. Visszaadja az eredményt

Futtatás: python yfinance_proxy.py
A szerver a http://localhost:8001-es porton fut.
"""

import yfinance as yf
import pandas as pd
import numpy as np
import requests
import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


# === INDIKÁTOR SZÁMÍTÁSOK ===

def rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50
    delta = pd.Series(closes).diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return float(100 - (100 / (1 + rs.iloc[-1])))


def macd(closes, fast=12, slow=26, signal_period=9):
    closes = pd.Series(closes)
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal = macd_line.ewm(span=signal_period, adjust=False).mean()
    hist = macd_line.iloc[-1] - signal.iloc[-1]
    return float(macd_line.iloc[-1]), float(signal.iloc[-1]), float(hist)


def bollinger(closes, period=20):
    closes = pd.Series(closes)
    sma = closes.rolling(window=period).mean().iloc[-1]
    std = closes.rolling(window=period).std().iloc[-1]
    return float(sma + 2 * std), float(sma), float(sma - 2 * std)


def ma_cross(closes):
    s9 = pd.Series(closes).rolling(9).mean().iloc[-1]
    s21 = pd.Series(closes).rolling(21).mean().iloc[-1]
    return float(s9 - s21)


def stoch(highs, lows, closes, period=14):
    h = pd.Series(highs).rolling(period).max().iloc[-1]
    l = pd.Series(lows).rolling(period).min().iloc[-1]
    c = closes[-1]
    return float(((c - l) / (h - l)) * 100) if h != l else 50.0


def volume_spike(volumes):
    recent = volumes[-1]
    avg = pd.Series(volumes[:-1]).tail(20).mean()
    return float(recent / avg) if avg > 0 else 1.0


def obv(closes, volumes):
    obv_val = 0
    for i in range(1, len(closes)):
        if closes[i] > closes[i-1]:
            obv_val += volumes[i]
        elif closes[i] < closes[i-1]:
            obv_val -= volumes[i]
    return obv_val


def atr(highs, lows, closes, period=14):
    tr = []
    for i in range(1, len(closes)):
        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i-1]),
            abs(lows[i] - closes[i-1])
        ))
    return float(np.mean(tr[-period:])) if tr else 0


def cci(highs, lows, closes, period=20):
    tps = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    if len(tps) < period:
        return 0
    recent = tps[-period:]
    sma = np.mean(recent)
    mean_dev = np.mean([abs(t - sma) for t in recent])
    return float((tps[-1] - sma) / (0.015 * mean_dev)) if mean_dev != 0 else 0


def adx(df, period=14):
    if len(df) < period * 2:
        return 20
    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs()
    ], axis=1).max(axis=1)
    atr_val = tr.rolling(period).mean()
    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)
    plus_di = 100 * pd.Series(plus_dm).rolling(period).mean() / atr_val
    minus_di = 100 * pd.Series(minus_dm).rolling(period).mean() / atr_val
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    return float(dx.rolling(period).mean().iloc[-1]) if not dx.empty else 20


# === JEV AI INTEGRÁCIÓ ===
def jev_decide(votes):
    jev_key = os.environ.get("REQUESTY_API_KEY", "")
    if not jev_key:
        return {"decision": "HOLD", "confidence": 0.5, "reasoning": "Jev key nincs beállítva"}

    bullish = sum(v["weight"] * v["confidence"] for v in votes if v["signal"] == "bullish")
    bearish = sum(v["weight"] * v["confidence"] for v in votes if v["signal"] == "bearish")
    score = bullish - bearish

    try:
        resp = requests.post(
            "https://router.requesty.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {jev_key}", "Content-Type": "application/json"},
            json={
                "model": "typesafe/jev-1.13.0",
                "messages": [{
                    "role": "user",
                    "content": f"10 indikátor szavazás: Bullish={bullish:.2f}, Bearish={bearish:.2f}, Score={score:.2f}. Adj döntést BUY/SELL/HOLD és konfidenciát."
                }],
                "response_format": {
                    "type": "questions",
                    "questions": {
                        "decision": {
                            "type": "choice",
                            "options": ["BUY", "SELL", "HOLD"],
                            "criteria": ["Long pozíció", "Short vagy close", "Várakozás"]
                        }
                    }
                },
                "max_tokens": 200
            },
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            try:
                parsed = json.loads(content) if content.startswith("{") else {}
                return {
                    "decision": parsed.get("answers", {}).get("decision", "HOLD"),
                    "confidence": parsed.get("confidence", 0.6),
                    "reasoning": f"Bullish: {bullish:.2f}, Bearish: {bearish:.2f}"
                }
            except:
                pass
    except Exception as e:
        print(f"Jev error: {e}", file=sys.stderr)

    # Fallback score-alapú döntés
    if score > 0.3:
        return {"decision": "BUY", "confidence": 0.6, "reasoning": "Score fallback (Jev nem elérhető)"}
    elif score < -0.3:
        return {"decision": "SELL", "confidence": 0.6, "reasoning": "Score fallback (Jev nem elérhető)"}
    return {"decision": "HOLD", "confidence": 0.5, "reasoning": "Score fallback (Jev nem elérhető)"}


# === HTTP HANDLER ===
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Csöndben marad

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"yfinance-proxy"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if "/analyze" not in self.path:
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"error":"invalid JSON"}')
            return

        ticker = body.get("ticker", "AAPL").upper()
        tf = body.get("timeframe", "15m")
        yf_interval = tf if tf in ["1m", "5m", "15m", "30m", "60m", "1h"] else "1d"
        # Növelt időszak a megbízható adatlekéréshez
        yf_period = "60d" if yf_interval in ["1m", "5m", "15m", "30m"] else "1y"

        try:
            df = yf.download(ticker, period=yf_period, interval=yf_interval, progress=False)
            if df is None or df.empty or len(df) < 30:
                raise ValueError("Nincs elég adat")

            # yfinance multi-index fix
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            
            closes = df["Close"].tolist()
            highs = df["High"].tolist()
            lows = df["Low"].tolist()
            volumes = df["Volume"].tolist() if "Volume" in df.columns else [0] * len(closes)
            current_price = closes[-1]

            # 10 indikátor
            votes = []
            rsi_val = rsi(closes)
            votes.append({
                "name": "RSI", "signal": "bullish" if rsi_val < 30 else ("bearish" if rsi_val > 70 else "neutral"),
                "weight": 0.15, "confidence": abs(50 - rsi_val) / 50,
                "value": round(rsi_val, 1), "reason": "Túladott" if rsi_val < 30 else ("Túlvett" if rsi_val > 70 else "Semleges")
            })

            m_v, m_s, m_h = macd(closes)
            votes.append({
                "name": "MACD", "signal": "bullish" if m_h > 0 else "bearish",
                "weight": 0.15, "confidence": min(1, abs(m_h) / (current_price * 0.01)),
                "value": round(m_h, 4), "reason": "Hisztogram pozitív" if m_h > 0 else "Hisztogram negatív"
            })

            ma_diff = ma_cross(closes)
            votes.append({
                "name": "MA Cross (9/21)", "signal": "bullish" if ma_diff > 0 else "bearish",
                "weight": 0.08, "confidence": min(1, abs(ma_diff) / (current_price * 0.005)),
                "value": round(ma_diff, 2), "reason": "MA9 > MA21" if ma_diff > 0 else "MA9 < MA21"
            })

            u, m, l = bollinger(closes)
            bb_pos = (current_price - l) / (u - l) if u != l else 0.5
            votes.append({
                "name": "Bollinger", "signal": "bullish" if current_price < l else ("bearish" if current_price > u else "neutral"),
                "weight": 0.08, "confidence": abs(0.5 - bb_pos) * 2,
                "value": f"{round(bb_pos * 100, 0)}%", "reason": "Alsó sáv alatt" if current_price < l else ("Felső sáv felett" if current_price > u else "Sávok közepén")
            })

            vs = volume_spike(volumes)
            trend_up = closes[-1] > closes[-5]
            votes.append({
                "name": "Volume", "signal": "bullish" if vs > 1.5 and trend_up else ("bearish" if vs > 1.5 and not trend_up else "neutral"),
                "weight": 0.1, "confidence": min(1, (vs - 1) / 2),
                "value": f"{round(vs, 2)}x", "reason": f"Volumen {round(vs, 2)}x, {'rally' if trend_up else 'dump'}"
            })

            st = stoch(highs, lows, closes)
            votes.append({
                "name": "Stochastic", "signal": "bullish" if st < 20 else ("bearish" if st > 80 else "neutral"),
                "weight": 0.08, "confidence": abs(50 - st) / 50,
                "value": round(st, 1), "reason": "Túladott" if st < 20 else ("Túlvett" if st > 80 else "Semleges")
            })

            adx_v = adx(df)
            votes.append({
                "name": "ADX", "signal": "bullish" if adx_v > 25 and trend_up else ("bearish" if adx_v > 25 and not trend_up else "neutral"),
                "weight": 0.08, "confidence": min(1, adx_v / 50),
                "value": round(adx_v, 1), "reason": f"Trend erősség {round(adx_v, 0)}"
            })

            cci_v = cci(highs, lows, closes)
            votes.append({
                "name": "CCI", "signal": "bullish" if cci_v < -100 else ("bearish" if cci_v > 100 else "neutral"),
                "weight": 0.08, "confidence": min(1, abs(cci_v) / 200),
                "value": round(cci_v, 1), "reason": "Túladott" if cci_v < -100 else ("Túlvett" if cci_v > 100 else "Semleges")
            })

            obv_v = obv(closes, volumes)
            votes.append({
                "name": "OBV", "signal": "bullish" if obv_v > 0 else "bearish",
                "weight": 0.1, "confidence": 0.5,
                "value": str(obv_v), "reason": "Pénz beáramlás" if obv_v > 0 else "Pénz kiáramlás"
            })

            atr_v = atr(highs, lows, closes)
            votes.append({
                "name": "ATR", "signal": "neutral",
                "weight": 0.05, "confidence": 0.3,
                "value": round(atr_v, 2), "reason": f"Volatilitás {round(atr_v, 2)}"
            })

            weighted_score = sum(
                (1 if v["signal"] == "bullish" else (-1 if v["signal"] == "bearish" else 0))
                * v["weight"] * v["confidence"]
                for v in votes
            )

            jev = jev_decide(votes)

            result = {
                "ticker": ticker,
                "timeframe": tf,
                "current_price": round(float(current_price), 2),
                "votes": votes,
                "weighted_score": round(float(weighted_score), 3),
                "jev_decision": jev["decision"],
                "jev_confidence": jev["confidence"],
                "jev_reasoning": jev["reasoning"],
                "atr": round(atr_v, 2),
                "analyzed_at": pd.Timestamp.now().isoformat()
            }

            response_json = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response_json)

        except Exception as e:
            print(f"Hiba: {e}", file=sys.stderr)
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))


def main():
    port = int(os.environ.get("PORT", 8001))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"YFinance Proxy elindítva: http://localhost:{port}")
    print(f"  POST /analyze - ticker + timeframe elemzés")
    print(f"  GET  /health - státusz")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Leállítva.")
        server.server_close()


if __name__ == "__main__":
    main()
