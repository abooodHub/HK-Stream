"""معالج HTTP لكل نقاط الـ API + خادم متعدّد الخيوط."""
import hashlib, json, os, threading, time
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

from . import config, store, auth, geoip, matches, metrics, detect, ome

# عدّاد اتصالات SSE المباشرة للإحصاءات (حدّ MAX_SSE_CLIENTS)
_stats_clients = 0
_stats_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self, public=False):
        if public:
            self.send_header("Access-Control-Allow-Origin", "*")
        else:
            origin  = self.headers.get("Origin", "")
            allowed = config.ALLOWED_ORIGIN if origin == config.ALLOWED_ORIGIN else "null"
            self.send_header("Access-Control-Allow-Origin", allowed)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")

    def do_OPTIONS(self):
        p = self.path.split("?")[0]
        self.send_response(204)
        self._cors(public=p in config.PUBLIC_PATHS)
        self.end_headers()

    def _json(self, code, obj, public=False, headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Cache-Control",  "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma",         "no-cache")
        self.send_header("Expires",        "0")
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        self._cors(public=public)
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        if not n: return {}
        raw = self.rfile.read(n)
        if isinstance(raw, bytes): raw = raw.decode("utf-8", errors="replace")
        try: return json.loads(raw)
        except: return {}

    def _bearer(self):
        a = self.headers.get("Authorization", "")
        if a.startswith("Bearer "):
            return auth.valid_token(a[7:])
        return False

    def _ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if forwarded: return forwarded
        return self.client_address[0]

    def _audit(self, action, detail=""):
        try: store.log_audit(action, detail, self._ip())
        except Exception: pass

    def _fmt_time(self, secs):
        secs = int(secs)
        if secs < 60:   return f"{secs} ث"
        if secs < 3600: return f"{secs//60} د"
        return f"{secs//3600} س {(secs%3600)//60} د"

    def do_POST(self):
        p = self.path.split("?")[0]

        if p == "/api/auth/login":
            client_ip = self._ip()
            if not auth.check_rate_limit(client_ip):
                config.sec_log.warning(f"[tracker-auth] Rate limit exceeded from {client_ip}")
                return self._json(429, {"error": "محاولات كثيرة، انتظر دقيقة"})
            body = self._body()
            if auth.check_pw(body.get("username", ""), body.get("password", "")):
                tok, exp = auth.make_token()
                self._audit("login", "دخول ناجح للوحة")
                self._json(200, {"token": tok, "expires": exp})
            else:
                config.sec_log.warning(f"[tracker-auth] Failed login attempt from {client_ip}")
                self._json(401, {"error": "بيانات خاطئة"})

        elif p == "/api/auth/change-password":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body    = self._body()
            old_pw  = body.get("old_password", "")
            new_pw  = body.get("new_password", "")
            if not auth.check_pw(auth.auth_cfg["username"], old_pw):
                return self._json(401, {"error": "كلمة المرور الحالية غير صحيحة"})
            if len(new_pw) < 6:
                return self._json(400, {"error": "كلمة المرور يجب أن تكون 6 أحرف على الأقل"})
            h, alg = auth.hash_pw(new_pw)
            auth.auth_cfg["pw_hash"]  = h
            auth.auth_cfg["hash_alg"] = alg
            with open(config.AUTH_FILE, "w") as f:
                json.dump(auth.auth_cfg, f, indent=2)
            self._audit("change_password", "تغيير كلمة مرور اللوحة")
            self._json(200, {"ok": True})



        elif p == "/api/stream-key/config":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            store.stream_key_cfg["enabled"] = bool(body.get("enabled", False))
            new_key = body.get("key", "").strip()
            if new_key:
                store.stream_key_cfg["key"] = new_key
            with open(config.STREAM_KEY_FILE, "w") as f:
                json.dump(store.stream_key_cfg, f, indent=2)
            self._audit("stream_key", ("تفعيل" if store.stream_key_cfg["enabled"] else "تعطيل") + " مفتاح البث")
            self._json(200, {"ok": True})

        elif p == "/api/ome/webhook":
            # Allow webhook requests from localhost or Docker bridge network range (172.x)
            client_ip = self.client_address[0]
            if client_ip != "127.0.0.1" and not client_ip.startswith("172.") and not client_ip.startswith("10.") and not client_ip.startswith("192.168."):
                return self._json(403, {"error": "forbidden"}, public=True)
            body = self._body()
            client_info = body.get("client", {})
            req_info = body.get("request", {})
            direction = req_info.get("direction", "incoming")
            protocol = req_info.get("protocol", "rtmp")
            url = req_info.get("url", "")
            client_ip = client_info.get("address", "")

            print(f"[OME WEBHOOK] {direction} request from {client_ip} using {protocol} on URL: {url}", flush=True)

            if direction == "outgoing":
                return self._json(200, {"allowed": True}, public=True)

            try:
                parsed = urlparse(url)
                path_parts = parsed.path.strip('/').split('/')
                stream_name = path_parts[-1] if path_parts else ""
            except Exception:
                stream_name = ""

            print(f"[OME WEBHOOK] Parsed stream name: {stream_name}", flush=True)

            def start_stream():
                now = time.time()
                with store.lock:
                    store.stream_meta.update({
                        "online": True, "bw_in": 6000000, "bw_out": 0,
                        "bytes_in": 0, "bytes_out": 0, "time_ms": 0,
                        "video": {}, "audio": {}, "started_at": now, "last_active_time": now,
                    })
                store.reset_interactions()

            if not store.stream_key_cfg.get("enabled"):
                start_stream()
                print(f"[OME WEBHOOK] Ingest ALLOWED (keys disabled). name={stream_name}", flush=True)
                return self._json(200, {"allowed": True}, public=True)

            expected = store.stream_key_cfg.get("key", "")
            if expected and stream_name == expected:
                start_stream()
                print(f"[OME WEBHOOK] Ingest ALLOWED. name={stream_name}", flush=True)
                return self._json(200, {"allowed": True}, public=True)

            print(f"[OME WEBHOOK] Ingest DENIED (invalid key). name={stream_name}", flush=True)
            return self._json(200, {"allowed": False}, public=True)



        elif p == "/api/heartbeat":
            ip = self._ip()
            if ip in store.bans:
                return self._json(403, {"error": "banned"}, public=True)
            if ip in store.kicks:
                return self._json(403, {"error": "kicked"}, public=True)
            if not auth.heartbeat_ok(ip):
                return self._json(429, {"error": "rate"}, public=True)
            ua   = self.headers.get("User-Agent", "")
            body = self._body()
            quality = body.get("quality", "")
            player_type = body.get("player_type", "main")
            store.update_viewer(ip, ua, quality, body.get("browser", ""), player_type)
            self._json(200, {"ok": True}, public=True)

        elif p == "/api/interaction":
            client_ip = self._ip()
            body = self._body()
            action = body.get("action")
            poll_opt = body.get("poll_choice")
            
            with store.lock:
                if client_ip in store.interaction_data["voted_ips"]:
                    prev = store.interaction_data["voted_ips"][client_ip]
                    if "action" in prev and action in ["like", "dislike"]:
                        return self._json(400, {"error": "already voted"}, public=True)
                    if "poll" in prev and poll_opt:
                        return self._json(400, {"error": "already voted poll"}, public=True)
                else:
                    store.interaction_data["voted_ips"][client_ip] = {}
                
                if action == "like":
                    store.interaction_data["likes"] += 1
                    store.interaction_data["voted_ips"][client_ip]["action"] = "like"
                elif action == "dislike":
                    store.interaction_data["dislikes"] += 1
                    store.interaction_data["voted_ips"][client_ip]["action"] = "dislike"
                
                if poll_opt and str(poll_opt) in store.interaction_data["poll"]:
                    store.interaction_data["poll"][str(poll_opt)] += 1
                    store.interaction_data["voted_ips"][client_ip]["poll"] = str(poll_opt)
                    
                store.save_interactions()
            
            self._json(200, {"ok": True}, public=True)

        elif p == "/api/interaction/reset":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            store.reset_interactions()
            self._audit("reset_interactions", "تصفير اللايكات والاستطلاع يدوياً")
            self._json(200, {"ok": True})

        elif p == "/api/kick/client":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            ip = self._body().get("ip", "")
            store.do_kick(ip, store.viewers.get(ip, {}).get("device", "unknown"))
            self._audit("kick", f"طرد {ip}")
            self._json(200, {"ok": True})

        elif p == "/api/ban":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            ip   = body.get("ip", "")
            store.do_ban(ip, store.viewers.get(ip, {}).get("device", "unknown"), body.get("reason", "admin"))
            self._audit("ban", f"حظر {ip}")
            self._json(200, {"ok": True})

        elif p == "/api/kicks/clear":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            ips_to_unkick = list(store.kicks.keys())
            with store.lock:
                store.kicks.clear()
                store.save_all()
            for ip in ips_to_unkick:
                store.iptables("-D", ip)
            self._audit("kicks_clear", "مسح كل عمليات الطرد")
            self._json(200, {"ok": True})

        elif p == "/api/logs/clear":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            ips_to_unkick = list(store.kicks.keys())
            with store.lock:
                store.kicks.clear()
                store.total_bytes_received = 0.0
                store.total_hls_bytes_sent = 0.0
                store.save_all()
            for ip in ips_to_unkick:
                store.iptables("-D", ip)
            self._audit("logs_clear", "مسح السجلّات والإجماليات")
            self._json(200, {"ok": True})

        elif p == "/api/bans/clear":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            ips_to_unban = list(store.bans.keys())
            with store.lock:
                store.bans.clear()
                store.save_all()
            for ip in ips_to_unban:
                store.iptables("-D", ip)
            self._audit("bans_clear", "مسح كل عمليات الحظر")
            self._json(200, {"ok": True})

        elif p == "/api/stream/title":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            store.stream_title_cfg["title"] = body.get("title", store.stream_title_cfg.get("title", "H&K Stream"))
            store.stream_title_cfg["subtitle"] = body.get("subtitle", store.stream_title_cfg.get("subtitle", ""))
            with open(config.STREAM_TITLE_FILE, "w") as f:
                json.dump(store.stream_title_cfg, f, indent=2, ensure_ascii=False)
            self._json(200, {"ok": True})

        elif p == "/api/stream/gate":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            store.stream_gated = bool(self._body().get("gated", False))
            self._audit("stream_gate", "إخفاء البث عن المشاهدين" if store.stream_gated else "إظهار البث")
            self._json(200, {"ok": True, "gated": store.stream_gated})

        elif p == "/api/stream/password-check":
            self._json(200, {"protected": store.stream_pass_cfg.get("enabled", False)}, public=True)

        elif p == "/api/stream/password-verify":
            body = self._body()
            password = body.get("password", "")
            is_enabled = store.stream_pass_cfg.get("enabled", False)
            correct_pass = store.stream_pass_cfg.get("password", "")
            
            valid = True
            if is_enabled:
                valid = (password == correct_pass)
            self._json(200, {"valid": valid}, public=True)

        elif p == "/api/leave":
            ip = self._ip()
            with store.lock:
                store.viewers.pop(ip, None)
            self._json(200, {"ok": True}, public=True)

        elif p == "/api/stream/password-settings":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            enabled = bool(body.get("enabled", False))
            password = body.get("password", "").strip()
            
            with store.lock:
                store.stream_pass_cfg["enabled"] = enabled
                if password:
                    store.stream_pass_cfg["password"] = password
                store.save_stream_pass()
            
            self._audit("stream_password", f"{'تفعيل' if enabled else 'تعطيل'} حماية كلمة مرور البث")
            self._json(200, {"ok": True})

        elif p == "/api/geo-block/config":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            store.geo_block_cfg["enabled"] = bool(body.get("enabled", False))
            countries = body.get("blocked_countries", [])
            if isinstance(countries, list):
                store.geo_block_cfg["blocked_countries"] = [c.upper() for c in countries if len(c) == 2]
            with open(config.GEOBLOCK_FILE, "w") as f:
                json.dump(store.geo_block_cfg, f, indent=2, ensure_ascii=False)
            self._audit("geo_block", ("تفعيل" if store.geo_block_cfg["enabled"] else "تعطيل") + " حظر الدول: " + ",".join(store.geo_block_cfg.get("blocked_countries", [])))
            self._json(200, {"ok": True})

        elif p == "/api/next-match":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            ts = body.get("ts")
            store.next_match_ts = int(ts) if ts else None
            try:
                with open(config.NEXT_MATCH_FILE, "w") as f:
                    json.dump({"ts": store.next_match_ts}, f)
            except Exception: pass
            self._json(200, {"ok": True, "ts": store.next_match_ts})

        elif p == "/api/site-settings":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            for k in config.SITE_DEFAULTS:
                if k in body:
                    store.site_settings[k] = bool(body[k])
            try:
                with open(config.SITE_SETTINGS_FILE, "w") as f:
                    json.dump(store.site_settings, f, indent=2)
            except Exception: pass
            self._json(200, {"ok": True, "settings": store.site_settings})

        elif p == "/api/football-api-key":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            body = self._body()
            key = str(body.get("key", "")).strip()
            store.football_api_key = key
            store.save(config.FOOTBALL_API_KEY_FILE, {"key": key})
            matches.matches_cache_time = 0  # أجبر إعادة الجلب
            self._json(200, {"ok": True})

        else:
            self._json(404, {"error": "not found"})

    def do_DELETE(self):
        p = self.path.split("?")[0]
        if not self._bearer(): return self._json(401, {"error": "unauthorized"})
        if p.startswith("/api/ban/"):
            store.do_unban(p[9:])
            self._audit("unban", f"رفع حظر {p[9:]}")
            self._json(200, {"ok": True})
        elif p.startswith("/api/kicked/"):
            store.do_unkick(p[12:])
            self._audit("unkick", f"رفع طرد {p[12:]}")
            self._json(200, {"ok": True})
        elif p == "/api/audit":
            with store.lock:
                store.audit_log.clear()
                store.save(config.AUDIT_FILE, store.audit_log)
            self._audit("audit_clear", "مسح سجلّ التدقيق")
            self._json(200, {"ok": True})
        elif p == "/api/sessions":
            store.sessions_log.clear()
            try:
                with open(config.SESSIONS_FILE, "w") as f:
                    json.dump(store.sessions_log, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
            self._json(200, {"ok": True})
        elif p.startswith("/api/sessions/"):
            sid = p[14:]
            before = len(store.sessions_log)
            store.sessions_log[:] = [s for s in store.sessions_log if s["id"] != sid]
            if len(store.sessions_log) < before:
                with open(config.SESSIONS_FILE, "w") as f:
                    json.dump(store.sessions_log, f, ensure_ascii=False, indent=2)
                self._json(200, {"ok": True})
            else:
                self._json(404, {"error": "not found"})

        elif p == "/api/next-match":
            store.next_match_ts = None
            try: os.remove(config.NEXT_MATCH_FILE)
            except OSError: pass
            self._json(200, {"ok": True})

        else:
            self._json(404, {"error": "not found"})

    def do_GET(self):
        p = self.path.split("?")[0]

        if p == "/api/auth/info":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            self._json(200, {"username": auth.auth_cfg["username"]})

        elif p == "/api/dashboard":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            self._json(200, self._build_dashboard())

        elif p == "/api/audit":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            self._json(200, {"entries": store.audit_log[:100]})

        elif p == "/api/stream-key/status":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            self._json(200, {
                "enabled": store.stream_key_cfg.get("enabled", False),
                "key":     store.stream_key_cfg.get("key", ""),
            })

        elif p == "/api/public/stats":
            stat = store.stream_meta
            online = stat.get("online", False) and not store.stream_gated
            self._json(200, {"online": online, "viewers": len(store.viewers) if online else 0}, public=True)

        elif p == "/api/health":
            stat = store.stream_meta
            self._json(200, {
                "status":   "ok",
                "online":   stat.get("online", False),
                "viewers":  len(store.viewers),
                "uptime_s": int(stat.get("time_ms", 0) // 1000) if stat.get("online") else 0,
            }, public=True)

        elif p == "/api/public/stats/live":
            global _stats_clients
            with _stats_lock:
                if _stats_clients >= config.MAX_SSE_CLIENTS:
                    return self._json(503, {"error": "too many connections"}, public=True)
                _stats_clients += 1
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self._cors(public=True)
            self.end_headers()
            try:
                last_viewers = -1
                last_online = None
                while True:
                    cur_viewers = len(store.viewers)
                    cur_online = store.stream_meta.get("online", False)
                    if cur_viewers != last_viewers or cur_online != last_online:
                        data = json.dumps({"online": cur_online, "viewers": cur_viewers})
                        self.wfile.write(f"data: {data}\n\n".encode())
                        self.wfile.flush()
                        last_viewers = cur_viewers
                        last_online = cur_online
                    time.sleep(2)
            except Exception:
                pass
            finally:
                with _stats_lock:
                    _stats_clients -= 1
            return





        elif p == "/api/sessions":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            self._json(200, {"sessions": store.sessions_log, "current": ome.current_session})

        elif p.startswith("/api/sessions/"):
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            sid = p[14:]  # /api/sessions/{id}
            found = next((s for s in store.sessions_log if s["id"] == sid), None)
            if found:
                self._json(200, found)
            else:
                self._json(404, {"error": "not found"})

        elif p == "/api/stream/title":
            self._json(200, store.stream_title_cfg, public=True)

        elif p == "/api/geo-block/status":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            self._json(200, store.geo_block_cfg)

        elif p == "/api/next-match":
            self._json(200, {"ts": store.next_match_ts}, public=True)

        elif p == "/api/matches":
            ms = matches.fetch_matches()
            self._json(200, {"matches": ms, "cached_at": int(matches.matches_cache_time)}, public=True)

        elif p == "/api/site-settings":
            self._json(200, store.site_settings, public=True)

        elif p == "/api/football-api-key":
            if not self._bearer(): return self._json(401, {"error": "unauthorized"})
            key = store.football_api_key or ""
            masked = (key[:4] + "••••" + key[-4:]) if len(key) > 8 else ("••••" if key else "")
            self._json(200, {"set": bool(key), "masked": masked})

        elif p == "/api/interaction":
            with store.lock:
                data = {
                    "likes": store.interaction_data["likes"],
                    "dislikes": store.interaction_data["dislikes"],
                    "poll": store.interaction_data["poll"],
                    "online": store.stream_meta.get("online", False)
                }
            self._json(200, data, public=True)

        else:
            self._json(404, {"error": "not found"})

    def _build_dashboard(self):
        stat   = store.stream_meta
        now    = time.time()
        kbps   = stat.get("bw_in", 0) // 1000
        uptime = stat.get("time_ms", 0) // 1000 if stat.get("online") else 0

        if store.bw_history:
            vals  = [x["kbps"] for x in store.bw_history[-24:] if x["kbps"] > 0]
            avg   = sum(vals) / len(vals) if vals else 0
            diffs = [abs(vals[i] - vals[i-1]) for i in range(1, len(vals))]
            if diffs and avg > 0:
                avg_diff  = sum(diffs) / len(diffs)
                stability = max(0, 100 - int((avg_diff / avg) * 100))
            else:
                stability = 100
        else:
            avg, stability = 0, 100

        # إجماليات تراكمية: كل الجلسات المؤرشفة + الجلسة الجارية حيّاً (تبقى عبر إعادة التشغيل)
        total_stream_s   = sum(int(s.get("duration_s", 0))        for s in store.sessions_log)
        total_recv_bytes = sum(int(s.get("total_recv_bytes", 0))  for s in store.sessions_log)
        total_sent_bytes = sum(int(s.get("total_sent_bytes", 0))  for s in store.sessions_log)
        sessions_count   = len(store.sessions_log)
        cs = ome.current_session
        if cs:
            total_stream_s   += max(0, int(now - cs.get("started_at", now)))
            total_recv_bytes += max(0, int(store.total_bytes_received  - getattr(ome, "session_bytes_recv_start", 0)))
            total_sent_bytes += max(0, int(store.total_hls_bytes_sent   - getattr(ome, "session_bytes_sent_start", 0)))
            sessions_count   += 1

        vc             = []
        device_counts  = defaultdict(int)
        browser_counts = defaultdict(int)
        quality_counts = defaultdict(int)
        country_counts = defaultdict(int)

        for ip, v in list(store.viewers.items()):
            dev  = v.get("device",  "desktop")
            ua   = v.get("ua", "")
            dev_name = detect.detect_device_name(ua)
            brow = v.get("browser", "Other")
            qual = v.get("quality", "تلقائي")
            cc   = geoip.resolve_ip_country_cached(ip)
            device_counts[dev_name] += 1
            browser_counts[brow] += 1
            quality_counts[qual] += 1
            country_counts[cc]   += 1
            vc.append({
                "ip":              ip,
                "device":          dev,
                "device_name":     dev_name,
                "browser":         brow,
                "quality":         v.get("quality", "تلقائي"),
                "player_type":     v.get("player_type", "main"),
                "type_label":      "HLS",
                "alive_formatted": self._fmt_time(now - v["first_seen"]),
                "is_banned":       ip in store.bans,
                "is_kicked":       ip in store.kicks,
                "country_code":    cc,
            })

        return {
            "stream": {
                "online": stat.get("online", False),
                "kbps":   {"recv_30s": kbps, "send_30s": stat.get("bw_out", 0) // 1000},
                "video":  stat.get("video", {}),
                "audio":  stat.get("audio", {}),
                "recv_bytes": int(store.total_bytes_received),
                "send_bytes": int(store.total_hls_bytes_sent),
            },
            "viewers":        {"current": len(store.viewers), "peak": store.peak_viewers, "unique_ips": len(store.viewers)},
            "viewer_clients": vc,
            "stats":          {
                "devices":   dict(device_counts),
                "browsers":  dict(browser_counts),
                "qualities": dict(quality_counts),
                "countries": dict(country_counts),
            },
            "uptime": uptime,
            "kicked": {"count": len(store.kicks), "list": [{"ip": ip, **v} for ip, v in store.kicks.items()]},
            "banned": {"count": len(store.bans),  "list": [{"ip": ip, **v} for ip, v in store.bans.items()]},
            "stream_gated": store.stream_gated,
            "stream_pass_enabled": store.stream_pass_cfg.get("enabled", False),
            "health": {
                "status":           "online" if (stat.get("online") and not store.stream_gated) else "offline",
                "stability_score":  stability,
                "freeze_count":     0,
                "avg_bitrate_kbps": int(avg),
                "quality_events":   [],
            },
            "bitrate_history": store.bw_history[-60:],

            "server_health": {
                "cpu": metrics.cpu_percent,
                "ram": metrics.get_ram_usage(),
                "disk": metrics.get_disk_usage(),
            },
            "server_uptime": metrics.get_server_uptime(),
            "totals": {
                "stream_seconds": total_stream_s,
                "recv_bytes":     total_recv_bytes,
                "sent_bytes":     total_sent_bytes,
                "sessions_count": sessions_count,
            },
            "sessions_summary": [
                {
                    "id": s["id"],
                    "started_at": s["started_at"],
                    "ended_at": s["ended_at"],
                    "duration_s": s["duration_s"],
                    "peak_viewers": s["peak_viewers"],
                    "avg_viewers": s.get("avg_viewers", 0),
                    "total_recv_bytes": s.get("total_recv_bytes", 0),
                    "total_sent_bytes": s.get("total_sent_bytes", 0),
                } for s in store.sessions_log[:10]
            ],
            "current_session": ome.current_session,
            "stream_title": store.stream_title_cfg,
            "geo_block": {
                "enabled": store.geo_block_cfg.get("enabled", False),
                "blocked_countries": store.geo_block_cfg.get("blocked_countries", []),
            },
            "interactions": {
                "likes": store.interaction_data["likes"],
                "dislikes": store.interaction_data["dislikes"],
                "poll": store.interaction_data["poll"],
            }
        }


class ThreadedServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
