"""Atualiza as cotações partilhadas na base de dados (Supabase) a partir do Yahoo Finance.

Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_KEY (chave de serviço: nunca no código nem na página).
Aviso: os dados do Yahoo são para uso pessoal. Para uma app aberta a outras pessoas, trocar por uma fonte licenciada.
"""
import json
import os
import sys
import urllib.error
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
    print(f"ok {len(rows)}, falhados {len(failed)}: {failed}")
    if symbols and not rows:
        sys.exit("Nenhum preço obtido (o Yahoo pode estar a bloquear este servidor)")


if __name__ == "__main__":
    main()
