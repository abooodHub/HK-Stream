"""مصادقة المدير والمشاهد: كلمات المرور، التوكنات، حدّ المحاولات، الإيقاف المؤقت."""
import hashlib, json, os, secrets, time
from collections import defaultdict

from . import config

# حالة قابلة للتغيير — تُقرأ/تُكتب عبر auth.NAME من الوحدات الأخرى
active_tokens   = {}
hls_tokens      = {}
login_attempts  = defaultdict(list)
heartbeat_hits  = defaultdict(list)
player_auth_fails = {}   # ip -> {"count": int, "lock_until": ts}
player_auth_version = 0  # يُزاد عند تغيير إعداد حماية المشاهدة → يُبَثّ للمشاهدين مباشرة


def load_auth():
    if os.path.exists(config.AUTH_FILE):
        with open(config.AUTH_FILE) as f:
            data = json.load(f)
        changed = False
        if config.USE_BCRYPT and data.get("hash_alg") != "bcrypt" and "plain_password" in data:
            data["pw_hash"] = config.bcrypt.hash(data["plain_password"])
            data["hash_alg"] = "bcrypt"
            data.pop("plain_password", None)
            changed = True
        elif data.pop("plain_password", None) is not None:
            changed = True
        if changed:
            with open(config.AUTH_FILE, "w") as f:
                json.dump(data, f, indent=2)
        return data
    pw = secrets.token_urlsafe(10)
    if config.USE_BCRYPT:
        data = {"username": "admin", "pw_hash": config.bcrypt.hash(pw), "hash_alg": "bcrypt"}
    else:
        data = {"username": "admin", "pw_hash": hashlib.sha256(pw.encode()).hexdigest(), "hash_alg": "sha256"}
    with open(config.AUTH_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[auth] admin password: {pw}")
    return data


def load_player_auth():
    try:
        with open(config.PLAYER_AUTH_FILE) as f:
            return json.load(f)
    except Exception:
        return {"enabled": False, "pw_hash": ""}


auth_cfg        = load_auth()
player_auth_cfg = load_player_auth()


def check_pw(username, password):
    if username != auth_cfg["username"]:
        return False
    alg = auth_cfg.get("hash_alg", "sha256")
    if alg == "bcrypt" and config.USE_BCRYPT:
        return config.bcrypt.verify(password, auth_cfg["pw_hash"])
    return hashlib.sha256(password.encode()).hexdigest() == auth_cfg["pw_hash"]


def hash_pw(password):
    if config.USE_BCRYPT:
        return config.bcrypt.hash(password), "bcrypt"
    return hashlib.sha256(password.encode()).hexdigest(), "sha256"


def check_rate_limit(ip):
    now = time.time()
    login_attempts[ip] = [t for t in login_attempts[ip] if now - t < config.LOGIN_WINDOW]
    if len(login_attempts[ip]) >= config.LOGIN_MAX:
        return False
    login_attempts[ip].append(now)
    return True


def heartbeat_ok(ip):
    """حدّ متساهل لنبضة المشاهد — يمنع الفيضان دون كسر النبض الشرعي (~12/دقيقة)."""
    now = time.time()
    heartbeat_hits[ip] = [t for t in heartbeat_hits[ip] if now - t < config.HEARTBEAT_WINDOW]
    if len(heartbeat_hits[ip]) >= config.HEARTBEAT_MAX:
        return False
    heartbeat_hits[ip].append(now)
    return True


def make_token():
    tok = secrets.token_hex(24)
    active_tokens[tok] = time.time() + config.TOKEN_TTL
    return tok, config.TOKEN_TTL


def valid_token(tok):
    return active_tokens.get(tok, 0) > time.time()


def make_hls_token():
    tok = secrets.token_hex(32)
    hls_tokens[tok] = time.time() + config.HLS_TOKEN_TTL
    return tok


def valid_hls_token(tok):
    if not tok:
        return False
    return hls_tokens.get(tok, 0) > time.time()
