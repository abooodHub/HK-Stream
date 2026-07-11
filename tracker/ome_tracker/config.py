"""الثوابت والمسارات وإعداد السجلّ الأمني — لا حالة قابلة للتغيير هنا."""
import logging, os

try:
    from passlib.hash import bcrypt
    USE_BCRYPT = True
except ImportError:
    bcrypt = None
    USE_BCRYPT = False

# --- الشبكة ---
# 127.0.0.1 افتراضياً (خلف nginx على نفس المضيف). داخل Docker اضبط TRACKER_HOST=0.0.0.0.
HOST = os.environ.get("TRACKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("TRACKER_PORT", "9999"))

# --- المسارات ---
DATA_DIR          = "/opt/ome-tracker/data"
BAN_FILE          = os.path.join(DATA_DIR, "banned_ips.json")
KICK_FILE         = os.path.join(DATA_DIR, "kicked_ips.json")
AUTH_FILE         = os.path.join(DATA_DIR, "admin_auth.json")
PLAYER_AUTH_FILE  = os.path.join(DATA_DIR, "player_auth.json")
STREAM_KEY_FILE   = os.path.join(DATA_DIR, "stream_key.json")
SESSIONS_FILE     = os.path.join(DATA_DIR, "stream_sessions.json")
GEOBLOCK_FILE     = os.path.join(DATA_DIR, "geo_block.json")
STREAM_TITLE_FILE    = os.path.join(DATA_DIR, "stream_title.json")
NEXT_MATCH_FILE      = os.path.join(DATA_DIR, "next_match.json")
SITE_SETTINGS_FILE   = os.path.join(DATA_DIR, "site_settings.json")
FOOTBALL_API_KEY_FILE = os.path.join(DATA_DIR, "football_api_key.json")
GEOIP_CACHE_FILE  = os.path.join(DATA_DIR, "geoip_cache.json")
AUDIT_FILE        = os.path.join(DATA_DIR, "audit_log.json")
INTERACTION_FILE  = os.path.join(DATA_DIR, "interaction.json")
STREAM_PASS_FILE  = os.path.join(DATA_DIR, "stream_password.json")

# --- أسرار من البيئة (لا تُكتب في الكود) ---
FOOTBALL_API_KEY = os.environ.get("FOOTBALL_API_KEY", "")
ALLOWED_ORIGIN   = os.environ.get("ALLOWED_ORIGIN", "https://your-domain.com")

# --- OME REST API (localhost فقط — لا تُعرَّض للعموم) ---
OME_API_HOST       = os.environ.get("OME_API_HOST", "127.0.0.1")
OME_API_PORT       = int(os.environ.get("OME_API_PORT", "8081"))
OME_ACCESS_TOKEN   = os.environ.get("OME_ACCESS_TOKEN", "")
OME_VHOST          = os.environ.get("OME_VHOST", "default")
OME_APP            = os.environ.get("OME_APP", "app")
OME_STREAM_NAME    = os.environ.get("OME_STREAM_NAME", "stream")

# --- ثوابت ---
FOOTBALL_COMPS  = "WC,CL,PL,PD,BL1,SA,FL1,EC"
VIEWER_TTL      = 5
TOKEN_TTL       = 3600
MAX_SSE_CLIENTS = 300
HLS_TOKEN_TTL   = 43200
TRUSTED_PROXY   = "127.0.0.1"
LOGIN_WINDOW    = 60
LOGIN_MAX       = 5
HEARTBEAT_WINDOW = 60   # نافذة حدّ معدّل نبضة المشاهد
HEARTBEAT_MAX    = 150   # حدّ متساهل (النبضة الشرعية ~12/دقيقة) — يمنع الفيضان فقط
PLAYER_AUTH_MAX_FAILS = 3    # محاولات المشاهد الخاطئة قبل الإيقاف المؤقت
PLAYER_AUTH_LOCK_SEC  = 300  # مدة الإيقاف (5 دقائق)
IPTABLES_BIN          = "/usr/sbin/iptables"
NGINX_ACCESS_LOG_GLOB = "/var/log/nginx/access.log*"

PUBLIC_PATHS = {"/api/heartbeat", "/api/public/stats", "/api/public/stats/live", "/api/health",
                "/api/player-auth/status", "/api/player-auth/verify",
                "/api/player-auth/check", "/api/stream/title",
                "/api/next-match", "/api/interaction",
                "/api/matches", "/api/site-settings",
                "/api/stream/password-check", "/api/stream/password-verify", "/api/leave"}

SITE_DEFAULTS = {"show_matches": True, "show_countdown_bar": True}

os.makedirs(DATA_DIR, exist_ok=True)

# --- السجلّ الأمني (لـ fail2ban) ---
_SEC_LOG_DIR  = "/var/log/ome-tracker"
_SEC_LOG_PATH = os.path.join(_SEC_LOG_DIR, "auth.log")
os.makedirs(_SEC_LOG_DIR, exist_ok=True)
sec_log = logging.getLogger("ome_tracker.security")
sec_log.setLevel(logging.WARNING)
_sec_handler = logging.FileHandler(_SEC_LOG_PATH)
_sec_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
sec_log.addHandler(_sec_handler)

