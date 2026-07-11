"""تحديد بلد الـ IP عبر ip-api.com مع تخزين مؤقت على القرص."""
import json, os

from . import config

cache = {}


def load_cache():
    global cache
    if os.path.exists(config.GEOIP_CACHE_FILE):
        try:
            with open(config.GEOIP_CACHE_FILE, "r") as f:
                cache = json.load(f)
        except Exception:
            cache = {}


def save_cache():
    try:
        with open(config.GEOIP_CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception:
        pass


def clear_cache():
    """تفريغ الذاكرة وحذف الملف (يُستخدم عند توقف البث لحماية الخصوصية)."""
    global cache
    cache = {}
    try:
        os.remove(config.GEOIP_CACHE_FILE)
    except OSError:
        pass


def is_local_ip(ip):
    return not ip or ip == "127.0.0.1" or ip.startswith("192.168.") or ip.startswith("10.")


def resolve_ip_country(ip):
    """بحث حاجب عبر ip-api.com. يُستدعى من الخيوط الخلفية فقط."""
    if is_local_ip(ip):
        return "local"
    if ip in cache:
        return cache[ip]
    try:
        import urllib.request
        url = f"http://ip-api.com/json/{ip}?fields=countryCode&lang=en"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read().decode("utf-8"))
        country_code = data.get("countryCode", "UN").upper()
        if country_code and len(country_code) == 2:
            cache[ip] = country_code
            save_cache()
            return country_code
        return "UN"
    except Exception:
        return "UN"


def resolve_ip_country_cached(ip):
    """بحث من الذاكرة فقط (غير حاجب). آمن للاستدعاء من معالجات الطلبات."""
    if is_local_ip(ip):
        return "local"
    return cache.get(ip, "UN")


load_cache()
