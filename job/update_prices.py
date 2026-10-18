"""Atualiza as cotações partilhadas na base de dados (Supabase) a partir do Yahoo Finance.

Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_KEY (chave de serviço: nunca no código nem na página).
Aviso: os dados do Yahoo são para uso pessoal. Para uma app aberta a outras pessoas, trocar por uma fonte licenciada.
"""
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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


def risk_from_closes(dates, closes):
    """Estatísticas de risco a partir de fechos diários (listas do mesmo tamanho, por ordem de data).
    Devolve dict com vol (% anual, últimos 252 dias), mdd (maior queda em 5 anos, %), off_high (% abaixo do máximo de 52 semanas hoje)
    e series {AAAA-MM: [volatilidade %, % abaixo do máximo de 52 semanas]} no último dia de cada mês (até 60 meses)."""
    import math
    n = len(closes)
    if n < 60:
        raise ValueError("histórico curto")
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, n)]

    def vol_at(i):  # volatilidade com os retornos até ao índice i (inclusive de closes)
        w = rets[max(0, i - 252):i]
        if len(w) < 40:
            return None
        m = sum(w) / len(w)
        return math.sqrt(sum((x - m) ** 2 for x in w) / (len(w) - 1)) * math.sqrt(252) * 100

    def off_at(i):
        hi = max(closes[max(0, i - 251):i + 1])
        return (closes[i] / hi - 1) * 100

    last_by_month = {}
    for i, d in enumerate(dates):
        last_by_month[d[:7]] = i
    months = sorted(last_by_month)[-60:]
    series = {}
    for m in months:
        i = last_by_month[m]
        v = vol_at(i)
        if v is not None:
            series[m] = [round(v, 1), round(off_at(i), 1)]
    start = max(0, n - 1260)
    peak, mdd = closes[start], 0.0
    for x in closes[start:]:
        peak = max(peak, x)
        mdd = min(mdd, (x / peak - 1) * 100)
    return {"vol": round(vol_at(n - 1), 1), "mdd": round(mdd, 1), "off_high": round(off_at(n - 1), 1), "series": series}


def fetch_risk(symbol):
    import yfinance as yf
    h = yf.Ticker(symbol).history(period="6y", interval="1d", auto_adjust=True)
    if h is None or len(h) == 0:
        raise ValueError("sem histórico")
    h = h.dropna(subset=["Close"])
    return risk_from_closes([d.strftime("%Y-%m-%d") for d in h.index], [float(x) for x in h["Close"]])


def update_risk(symbols):
    """Uma vez por semana por símbolo. Se a tabela ainda não existir (phase6.sql), ignora."""
    try:
        have = api("GET", "risk_stats?select=symbol,updated_at") or []
    except RuntimeError as e:
        print(f"  risco ignorado (corre o phase6.sql no Supabase): {e}")
        return
    last = {r["symbol"]: r.get("updated_at") for r in have}
    now = datetime.now(timezone.utc)
    done = 0
    for s in symbols:
        if done >= 25:  # no máximo 25 por corrida; o resto fica para a seguinte
            break
        t = last.get(s)
        if t and (now - datetime.fromisoformat(t.replace("Z", "+00:00"))).total_seconds() < 6 * 86400:
            continue
        try:
            r = fetch_risk(s)
            api("POST", "risk_stats", [dict(symbol=s, updated_at=now.isoformat(), **r)],
                prefer="resolution=merge-duplicates,return=minimal")
            done += 1
        except Exception as e:
            print(f"  risco falhou {s}: {e}")
    print(f"risco atualizado: {done}")


ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod="


def parse_ecb_csv(text):
    """CSV do BCE -> [(dia ISO, dólares por 1 euro)]."""
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            v = float(r["OBS_VALUE"])
            if v > 0:
                out.append((r["TIME_PERIOD"], v))
        except (KeyError, ValueError, TypeError):
            continue
    return out


def fetch_fx_days(start):
    try:
        req = urllib.request.Request(ECB_URL + start, headers={"Accept": "text/csv"})
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = parse_ecb_csv(r.read().decode("utf-8"))
        if rows:
            return rows, "ecb"
    except Exception as e:
        print(f"  BCE indisponível ({e}); a usar Yahoo")
    import yfinance as yf
    h = yf.Ticker("EURUSD=X").history(start=start, interval="1d")["Close"].dropna()
    return [(i.strftime("%Y-%m-%d"), float(v)) for i, v in h.items()], "yahoo"


def update_fx_history():
    """Câmbio diário EUR/USD (incremental). Se a tabela ainda não existir, ignora."""
    try:
        last = api("GET", "fx_history?select=day&pair=eq.EURUSD&order=day.desc&limit=1") or []
    except RuntimeError as e:
        print(f"  histórico de câmbio ignorado (corre o phase3.sql no Supabase): {e}")
        return
    start = (date.fromisoformat(last[0]["day"]) - timedelta(days=10)).isoformat() if last else "2024-01-01"
    try:
        rows, src = fetch_fx_days(start)
        for i in range(0, len(rows), 500):
            api("POST", "fx_history", [{"pair": "EURUSD", "day": d, "rate": v, "source": src} for d, v in rows[i:i + 500]],
                prefer="resolution=merge-duplicates,return=minimal")
        print(f"histórico de câmbio ({src}): {len(rows)} dias desde {start}")
    except Exception as e:
        print(f"  histórico de câmbio falhou: {e}")


def apply_recurring():
    """Aportes automáticos mensais: no dia pedido (ou na primeira corrida depois dele) soma o valor à posição manual.
    Cada aporte só corre uma vez por mês. Se a tabela ainda não existir, ignora."""
    try:
        rows = api("GET", "recurring_contribs?select=*&active=eq.true") or []
    except RuntimeError as e:
        print(f"  aportes automáticos ignorados (corre o phase5.sql no Supabase): {e}")
        return
    today = datetime.now(ZoneInfo("Europe/Lisbon")).date()
    month_start = today.replace(day=1).isoformat()
    done = 0
    for r in rows:
        try:
            if today.day < int(r["day"]) or (r.get("last_run") and str(r["last_run"])[:7] == today.isoformat()[:7]):
                continue
            prev = r.get("last_run")
            # reservar este mês (se outra corrida já o fez, não devolve nada)
            claim = api("PATCH", f"recurring_contribs?id=eq.{r['id']}&or=(last_run.is.null,last_run.lt.{month_start})",
                        {"last_run": today.isoformat()}, prefer="return=representation") or []
            if not claim:
                continue
            try:
                pos = (api("GET", f"positions?id=eq.{r['position_id']}&select=qty,avg_cost,manual_price,manual,user_id") or [None])[0]
                if not pos or not pos.get("manual") or pos.get("manual_price") is None or (pos.get("user_id") and r.get("user_id") and pos["user_id"] != r["user_id"]):
                    raise RuntimeError("posição não existe ou não é manual")
                qty = float(pos["qty"]) or 1.0
                add = float(r["amount"]) / qty
                api("PATCH", f"positions?id=eq.{r['position_id']}",
                    {"avg_cost": round(float(pos["avg_cost"]) + add, 6), "manual_price": round(float(pos["manual_price"]) + add, 6),
                     "manual_price_at": datetime.now(timezone.utc).isoformat()}, prefer="return=minimal")
                done += 1
            except Exception:
                api("PATCH", f"recurring_contribs?id=eq.{r['id']}", {"last_run": prev}, prefer="return=minimal")  # libertar para tentar de novo
                raise
        except Exception as e:
            print(f"  aporte automático falhou ({r.get('id')}): {e}")
    print(f"aportes automáticos aplicados: {done}")


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
    apply_recurring()
    api("POST", "rpc/refresh_snapshots", {})
    update_dividends([r["symbol"] for r in rows])
    update_risk(symbols)
    update_fx_history()
    print(f"ok {len(rows)}, falhados {len(failed)}: {failed}")
    if symbols and not rows:
        sys.exit("Nenhum preço obtido (o Yahoo pode estar a bloquear este servidor)")


if __name__ == "__main__":
    main()
