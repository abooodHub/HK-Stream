"""جلب مواعيد المباريات من football-data.org مع تخزين مؤقت 30 دقيقة."""
import json, threading, time
from datetime import datetime, timezone

from . import config, store

matches_cache      = []
matches_cache_time = 0.0
_matches_lock      = threading.Lock()


def fetch_matches():
    global matches_cache, matches_cache_time
    now = time.time()
    with _matches_lock:
        if now - matches_cache_time < 120 and matches_cache:  # كاش قصير لحالة مباشرة محدّثة
            return list(matches_cache)
    try:
        import urllib.request as _ur
        from datetime import timedelta as _td
        today = datetime.now(timezone.utc)
        d_from = (today - _td(days=1)).strftime("%Y-%m-%d")
        d_to   = (today + _td(days=5)).strftime("%Y-%m-%d")
        url = (f"https://api.football-data.org/v4/matches"
               f"?competitions={config.FOOTBALL_COMPS}&dateFrom={d_from}&dateTo={d_to}")
        api_key = getattr(store, 'football_api_key', None) or config.FOOTBALL_API_KEY
        req = _ur.Request(url, headers={"X-Auth-Token": api_key})
        with _ur.urlopen(req, timeout=7) as res:
            data = json.loads(res.read().decode("utf-8"))
        matches = []
        for m in data.get("matches", []):
            ft = m.get("score", {}).get("fullTime", {})
            ht = m.get("score", {}).get("halfTime", {})
            matches.append({
                "id": m["id"],
                "competition": {
                    "name": m["competition"]["name"],
                    "code": m["competition"]["code"],
                    "emblem": m["competition"].get("emblem", ""),
                },
                "homeTeam": {
                    "name": m["homeTeam"]["name"],
                    "shortName": m["homeTeam"].get("shortName", m["homeTeam"]["name"]),
                    "tla": m["homeTeam"].get("tla", ""),
                    "crest": m["homeTeam"].get("crest", ""),
                },
                "awayTeam": {
                    "name": m["awayTeam"]["name"],
                    "shortName": m["awayTeam"].get("shortName", m["awayTeam"]["name"]),
                    "tla": m["awayTeam"].get("tla", ""),
                    "crest": m["awayTeam"].get("crest", ""),
                },
                "utcDate": m["utcDate"],
                "status": m.get("status", "TIMED"),
                "score": {
                    "home": ft.get("home"),
                    "away": ft.get("away"),
                    "htHome": ht.get("home"),
                    "htAway": ht.get("away"),
                },
                "group": m.get("group", ""),
                "stage": m.get("stage", ""),
                "matchday": m.get("matchday"),
            })
        with _matches_lock:
            matches_cache = matches
            matches_cache_time = now
        return matches
    except Exception as e:
        print(f"[matches] fetch error: {e}", flush=True)
        with _matches_lock:
            return list(matches_cache)
