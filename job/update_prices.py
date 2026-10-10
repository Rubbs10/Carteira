"""Atualiza as cotações partilhadas na base de dados (Supabase) a partir do Yahoo Finance.

Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_KEY (chave de serviço: nunca no código nem na página).
Aviso: os dados do Yahoo são para uso pessoal. Para uma app aberta a outras pessoas, trocar por uma fonte licenciada.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def api(method, path, body=None, prefer=None):
    headers = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(URL + "/rest/v1/" + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code} {e.read().decode()[:300]}") from None
    return json.loads(raw) if raw else None


def fetch(symbol):
    import yfinance as yf
    fi = yf.Ticker(symbol).fast_info
    price = fi["last_price"]
    prev = fi["previous_close"]
    cur = fi["currency"]
    if price is None or not (price > 0):
        raise ValueError("sem preço")
    return {
        "symbol": symbol,
        "price": float(price),
        "prev_close": float(prev) if prev and prev > 0 else None,
        "currency": str(cur).upper() if cur else None,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "yahoo",
    }


def fetch_div(symbol):
    """Dividendos pagos nos últimos 12 meses, por unidade (na moeda da cotação). 0 se não paga."""
    import pandas as pd
    import yfinance as yf
    d = yf.Ticker(symbol).dividends
    if d is None or len(d) == 0:
        return 0.0
    cutoff = pd.Timestamp.now(tz=d.index.tz) - pd.Timedelta(days=365)
    return float(d[d.index > cutoff].sum())


def update_dividends(symbols):
    """Uma vez por dia por símbolo (não em cada corrida de 15 minutos). Se a coluna ainda não existir, ignora."""
    try:
        have = api("GET", "quotes?select=symbol,div_at") or []
    except RuntimeError as e:
        print(f"  dividendos ignorados (corre o phase1.sql no Supabase): {e}")
        return
    last = {r["symbol"]: r.get("div_at") for r in have}
    now = datetime.now(timezone.utc)
    done = 0
    for s in symbols:
        t = last.get(s)
        if t and (now - datetime.fromisoformat(t.replace("Z", "+00:00"))).total_seconds() < 20 * 3600:
            continue
        try:
            rate = fetch_div(s)
            api("PATCH", "quotes?symbol=eq." + urllib.parse.quote(s, safe=""),
                {"div_rate": rate, "div_at": now.isoformat()}, prefer="return=minimal")
            done += 1
        except Exception as e:
            print(f"  dividendos falharam {s}: {e}")
    print(f"dividendos atualizados: {done}")


def main():
    if not URL or not KEY:
        sys.exit("Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY")
    symbols = api("POST", "rpc/symbols_to_update", {}) or []
    print(f"{len(symbols)} símbolos")
    rows, failed = [], []
    for s in symbols:
        try:
            rows.append(fetch(s))
        except Exception as e:  # um símbolo mau não pára os outros
            failed.append(s)
            print(f"  falhou {s}: {e}")
    if rows:
        api("POST", "quotes", rows, prefer="resolution=merge-duplicates,return=minimal")
    try:
        x = fetch("EURUSD=X")["price"]  # dólares por euro
        api("POST", "fx_rates", [{"pair": "USD_EUR", "rate": 1 / x, "as_of": datetime.now(timezone.utc).isoformat()}],
            prefer="resolution=merge-duplicates,return=minimal")
        print(f"câmbio USD_EUR = {1 / x:.5f}")
    except Exception as e:
        print(f"  câmbio não atualizado: {e}")
    api("POST", "rpc/refresh_snapshots", {})
    update_dividends([r["symbol"] for r in rows])
    print(f"ok {len(rows)}, falhados {len(failed)}: {failed}")
    if symbols and not rows:
        sys.exit("Nenhum preço obtido (o Yahoo pode estar a bloquear este servidor)")


if __name__ == "__main__":
    main()
