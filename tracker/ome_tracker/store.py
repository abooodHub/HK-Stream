"""وحدة الحالة المشتركة: حفظ/تحميل JSON + كل الحالة القابلة للتغيير وقت التشغيل.

المتغيّرات القياسية (peak_viewers, total_*, stream_gated...) تُعاد كتابتها من
وحدات أخرى عبر `store.NAME = ...` — لا تستوردها بالاسم وإلا ستحصل على نسخة قديمة.
"""
import ipaddress, json, os, subprocess, tempfile, threading, time
from datetime import datetime

from . import config, detect

lock = threading.Lock()


# --- حفظ/تحميل JSON ---
def load(path, default=None):
    if default is None:
        default = {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def save(path, data):
    dir_ = os.path.dirname(path) or "."
    with tempfile.NamedTemporaryFile("w", dir=dir_, delete=False, suffix=".tmp", encoding="utf-8") as tf:
        json.dump(data, tf, ensure_ascii=False, indent=2)
        tmp_path = tf.name
    os.replace(tmp_path, path)


def validate_ip(ip):
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


# --- محمّلات الإعدادات ---
def load_stream_key():
    try:
        with open(config.STREAM_KEY_FILE) as f:
            return json.load(f)
    except Exception:
        return {"enabled": False, "key": ""}


def load_sessions():
    try:
        with open(config.SESSIONS_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def load_geoblock():
    try:
        with open(config.GEOBLOCK_FILE) as f:
            return json.load(f)
    except Exception:
        return {"enabled": False, "blocked_countries": []}


def load_stream_title():
    try:
        with open(config.STREAM_TITLE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"title": "H&K Stream", "subtitle": "بث مباشر"}

def load_stream_pass():
    try:
        with open(config.STREAM_PASS_FILE) as f:
            return json.load(f)
    except Exception:
        return {"enabled": False, "password": ""}


def load_next_match():
    global next_match_ts
    try:
        with open(config.NEXT_MATCH_FILE) as f:
            next_match_ts = json.load(f).get("ts")
    except Exception:
        next_match_ts = None


def load_site_settings():
    global site_settings
    try:
        with open(config.SITE_SETTINGS_FILE) as f:
            data = json.load(f)
        site_settings = {**config.SITE_DEFAULTS, **{k: v for k, v in data.items() if k in config.SITE_DEFAULTS}}
    except Exception:
        site_settings = dict(config.SITE_DEFAULTS)


def load_football_api_key():
    global football_api_key
    try:
        with open(config.FOOTBALL_API_KEY_FILE) as f:
            football_api_key = json.load(f).get("key", "") or config.FOOTBALL_API_KEY
    except Exception:
        football_api_key = config.FOOTBALL_API_KEY


# --- الحالة المُحمّلة ---
bans  = load(config.BAN_FILE,  {})
kicks = load(config.KICK_FILE, {})
stream_key_cfg   = load_stream_key()
sessions_log     = load_sessions()
geo_block_cfg    = load_geoblock()
stream_title_cfg = load_stream_title()
stream_pass_cfg  = load_stream_pass()
next_match_ts    = None
site_settings    = dict(config.SITE_DEFAULTS)
football_api_key = config.FOOTBALL_API_KEY
load_next_match()
load_site_settings()
load_football_api_key()

def load_interactions():
    try:
        with open(config.INTERACTION_FILE) as f:
            return json.load(f)
    except Exception:
        return {"likes": 0, "dislikes": 0, "poll": {"1": 0, "2": 0, "3": 0}, "voted_ips": {}}

interaction_data = load_interactions()

def save_interactions():
    save(config.INTERACTION_FILE, interaction_data)

def reset_interactions():
    with lock:
        interaction_data["likes"] = 0
        interaction_data["dislikes"] = 0
        interaction_data["poll"] = {"1": 0, "2": 0, "3": 0}
        interaction_data["voted_ips"] = {}
        save_interactions()


def save_all():
    save(config.BAN_FILE,  bans)
    save(config.KICK_FILE, kicks)

def save_stream_pass():
    save(config.STREAM_PASS_FILE, stream_pass_cfg)


# --- سجلّ تدقيق أفعال المدير (ring buffer) ---
audit_log = load(config.AUDIT_FILE, [])
if not isinstance(audit_log, list):
    audit_log = []
AUDIT_MAX = 200


def log_audit(action, detail="", ip=""):
    """يسجّل فعلاً إدارياً. لا يُستدعى وقفل `lock` ممسوك (يمسكه داخلياً)."""
    with lock:
        audit_log.insert(0, {
            "ts":           time.time(),
            "ts_formatted": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "action":       action,
            "detail":       str(detail)[:200],
            "ip":           ip,
        })
        del audit_log[AUDIT_MAX:]
        save(config.AUDIT_FILE, audit_log)


# --- تتبّع المشاهدين ---
viewers = {}


def update_viewer(ip, ua="", quality="", browser="", player_type="main"):
    now = time.time()
    if ip not in viewers:
        viewers[ip] = {
            "first_seen": now,
            "device":  detect.detect_device(ua),
            "browser": browser or detect.detect_browser(ua),
            "ua":      ua,
            "quality": quality or "تلقائي",
            "player_type": player_type,
        }
    viewers[ip]["last_seen"] = now
    if quality: viewers[ip]["quality"] = quality
    if browser: viewers[ip]["browser"] = browser
    if player_type: viewers[ip]["player_type"] = player_type


def expire_viewers():
    now = time.time()
    for ip in [ip for ip, v in viewers.items() if now - v["last_seen"] > config.VIEWER_TTL]:
        viewers.pop(ip, None)


# --- إحصاءات البث الحيّة ---
bw_history  = []
stream_meta = {
    "online": False, "bw_in": 0, "bw_out": 0, "bytes_in": 0, "bytes_out": 0,
    "time_ms": 0, "video": {}, "audio": {}, "started_at": 0.0, "last_active_time": 0.0,
}

peak_viewers = 0
total_bytes_received = 0.0
total_hls_bytes_sent = 0.0
last_poll_time = time.time()
stream_gated = False          # عند True يرى المشاهدون البث كأنه متوقف
ome_api_fail_count = 0        # عدد فشل متتالي للـ OME API (كل 5s) — بعد 6 = offline


# --- الحظر/الطرد عبر iptables ---
def iptables(action, ip):
    try:
        subprocess.run([config.IPTABLES_BIN, action, "INPUT", "-s", ip, "-j", "DROP"],
                       check=True, capture_output=True)
    except Exception:
        pass


def do_kick(ip, device="unknown"):
    if not validate_ip(ip):
        return
    with lock:
        kicks[ip] = {
            "kicked_at": time.time(),
            "kicked_at_formatted": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "expires": time.time() + 3600,
            "expires_formatted": "بعد ساعة",
            "device": device,
        }
        save_all()
    iptables("-I", ip)
    viewers.pop(ip, None)


def do_ban(ip, device="unknown", reason="admin"):
    if not validate_ip(ip):
        return
    with lock:
        bans[ip] = {
            "banned_at": time.time(),
            "banned_at_formatted": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "device": device,
            "reason": reason,
        }
        save_all()
    iptables("-I", ip)
    viewers.pop(ip, None)


def do_unban(ip):
    if not validate_ip(ip):
        return
    with lock:
        bans.pop(ip, None)
        save_all()
    iptables("-D", ip)


def do_unkick(ip):
    if not validate_ip(ip):
        return
    with lock:
        kicks.pop(ip, None)
        save_all()
    iptables("-D", ip)
