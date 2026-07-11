"""استعلام OME Control API، خيط الاستطلاع الدوري، وتتبّع جلسات البث.

يعيد كتابة عدّادات store (peak_viewers/total_*/last_poll_time) عبر store.NAME.
متغيّرات الجلسة هنا تُقرأ من handler عبر ome.current_session.

الواجهة العامة محفوظة: current_session, start_poller() — لا تُكسر عقود الاستيراد.
"""
import glob, json, os, threading, time
from datetime import datetime

from . import config, store, geoip, metrics

# --- متغيّرات تتبّع الجلسة ---
current_session = None
last_stream_online = False
session_viewer_samples = []
last_viewer_sample_ts = 0
session_bytes_recv_start = 0.0
session_bytes_sent_start = 0.0

# --- عيّنات البايتات لحساب معدّل البت اللحظي (OME لا يعطي bitrate جاهزاً) ---
_last_bytes_received = None
_last_bytes_sent = None
_last_bytes_ts = None


def query_ome_api(path):
    """استعلام OME API عبر urllib مع توثيق Basic (بدون اعتماديات خارجية)."""
    try:
        import urllib.request, base64
        host = config.OME_API_HOST
        port = config.OME_API_PORT
        token = config.OME_ACCESS_TOKEN
        url = f"http://{host}:{port}{path}"
        auth_str = base64.b64encode(token.encode("utf-8")).decode("utf-8")
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "Authorization": f"Basic {auth_str}"
        })
        with urllib.request.urlopen(req, timeout=2) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        import sys
        print(f"[OME API ERROR] path: {path}, error: {e}", file=sys.stderr)
        return None


def _parse_ready_time(ready_time_str, fallback):
    """حوّل readyTime (RFC3339) إلى epoch ثوانٍ."""
    if not ready_time_str:
        return fallback
    try:
        # يدعم ...Z و ...+00:00
        s = str(ready_time_str).replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return fallback



def _compute_bitrate(bytes_now, last_bytes, dt):
    """(delta_bytes * 8) / delta_seconds → بت/ثانية."""
    if last_bytes is None or dt <= 0:
        return None
    delta = max(0, int(bytes_now) - int(last_bytes))
    return int((delta * 8) / dt)


def purge_viewer_ips():
    """حذف كل عناوين IP الخاصة بالمشاهدين فور توقف البث.
    لا يمس قوائم الحظر/الطرد لأنها ضرورية لاستمرار المنع."""
    with store.lock:
        store.viewers.clear()
    geoip.clear_cache()
    for path in glob.glob(config.NGINX_ACCESS_LOG_GLOB):
        try:
            if path.endswith("access.log"):
                open(path, "w").close()  # truncate الملف النشط بدون كسر nginx
            else:
                os.remove(path)          # حذف الأرشيف المدوّر (.1 / .gz)
        except OSError:
            pass


def track_session():
    global current_session, last_stream_online, session_viewer_samples, last_viewer_sample_ts
    global session_bytes_recv_start, session_bytes_sent_start
    online = store.stream_meta.get("online", False)
    now = time.time()

    if online and not last_stream_online:
        # بدأ البث — لقطة أساس البايتات
        session_bytes_recv_start = store.total_bytes_received
        session_bytes_sent_start = store.total_hls_bytes_sent
        current_session = {
            "id": datetime.now().strftime("%Y%m%d_%H%M%S"),
            "started_at": int(now), "ended_at": None, "duration_s": 0,
            "peak_viewers": 0, "avg_viewers": 0, "total_unique_ips": 0,
            "total_sent_bytes": 0, "total_recv_bytes": 0, "quality_events": 0,
            "viewer_timeline": [],
        }
        session_viewer_samples = []
        last_viewer_sample_ts = now

    elif not online and last_stream_online and current_session:
        # انتهى البث — احسب بايتات هذه الجلسة فقط
        current_session["ended_at"] = int(now)
        current_session["duration_s"] = int(now - current_session["started_at"])
        current_session["viewer_timeline"] = session_viewer_samples
        if session_viewer_samples:
            counts = [s["count"] for s in session_viewer_samples]
            current_session["peak_viewers"] = max(counts)
            current_session["avg_viewers"] = round(sum(counts)/len(counts), 1)
        current_session["total_sent_bytes"] = int(store.total_hls_bytes_sent - session_bytes_sent_start)
        current_session["total_recv_bytes"] = int(store.total_bytes_received - session_bytes_recv_start)
        store.sessions_log.insert(0, current_session)  # الأحدث أولاً
        if len(store.sessions_log) > 100:
            store.sessions_log.pop()
        try:
            with open(config.SESSIONS_FILE, "w") as f:
                json.dump(store.sessions_log, f, ensure_ascii=False, indent=2)
        except Exception as e:
            import sys, traceback
            print(f"[POLLER LOOP ERROR]: {e}", file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
        current_session = None
        purge_viewer_ips()

    elif online and current_session:
        cur_count = len(store.viewers)
        if cur_count > current_session["peak_viewers"]:
            current_session["peak_viewers"] = cur_count
        if now - last_viewer_sample_ts >= 60:
            session_viewer_samples.append({"ts": int(now), "count": cur_count})
            last_viewer_sample_ts = now

    last_stream_online = online


def poller():
    global _last_bytes_received, _last_bytes_sent, _last_bytes_ts

    while True:
        try:
            store.expire_viewers()

            # انتهاء صلاحية الطرد تلقائياً
            now = time.time()
            expired_kicks = [ip for ip, k in list(store.kicks.items()) if k.get("expires", 0) < now]
            if expired_kicks:
                with store.lock:
                    for ip in expired_kicks:
                        store.kicks.pop(ip, None)
                store.save_all()
                for ip in expired_kicks:
                    store.iptables("-D", ip)

            # استعلام OME عن إحصائيات البث والتدفقات
            raw_stats = query_ome_api("/v1/stats/current")
            raw_streams = query_ome_api(
                f"/v1/vhosts/{config.OME_VHOST}/apps/{config.OME_APP}/streams"
            )

            # OME يعيد البيانات في حقل "response"
            stats_res = (raw_stats or {}).get("response", raw_stats) if isinstance(raw_stats, dict) else raw_stats
            streams_res = (raw_streams or {}).get("response", raw_streams)

            online = False
            bitrate = 0
            bw_out = 0
            started_at = now
            v_width = 0
            v_height = 0
            v_codec = "h264"
            a_codec = "aac"
            bytes_recv = None
            bytes_sent = None

            found_stream = None
            if streams_res is not None and isinstance(streams_res, list):
                for s in streams_res:
                    if isinstance(s, dict) and s.get("name") == config.OME_STREAM_NAME:
                        found_stream = s
                        break

            if found_stream is not None:
                online = True
                created_time = found_stream.get("createdTime")
                if created_time:
                    started_at = _parse_ready_time(created_time, now)

            if stats_res is not None and isinstance(stats_res, dict):
                if online:
                    bitrate = int(stats_res.get("avgThroughputIn", 0) or 0)
                    bw_out = int(stats_res.get("avgThroughputOut", 0) or 0)
                    raw_recv = stats_res.get("totalBytesIn")
                    raw_sent = stats_res.get("totalBytesOut")
                    try:
                        bytes_recv = int(raw_recv) if raw_recv is not None else None
                    except (TypeError, ValueError):
                        bytes_recv = None
                    try:
                        bytes_sent = int(raw_sent) if raw_sent is not None else None
                    except (TypeError, ValueError):
                        bytes_sent = None

            sample_dt = max(0.0, now - (_last_bytes_ts or store.last_poll_time))
            if online and bytes_recv is not None:
                measured = _compute_bitrate(bytes_recv, _last_bytes_received, sample_dt)
                if measured is not None:
                    bitrate = measured
                else:
                    # أول عيّنة بعد الاتصال — احتفظ بآخر قيمة معروفة إن وُجدت
                    bitrate = int(store.stream_meta.get("bw_in", 0) or 0)
            if online and bytes_sent is not None:
                measured_out = _compute_bitrate(bytes_sent, _last_bytes_sent, sample_dt)
                if measured_out is not None:
                    bw_out = measured_out

            # حدّث عيّنات البايتات دائماً عند وجود قراءة ناجحة (حتى عند offline لإعادة الضبط)
            if stats_res is not None:
                if online and bytes_recv is not None:
                    _last_bytes_received = bytes_recv
                    _last_bytes_sent = bytes_sent
                    _last_bytes_ts = now
                else:
                    # البث متوقف أو المسار غير جاهز — صفّر العيّنات للجلسة القادمة
                    _last_bytes_received = None
                    _last_bytes_sent = None
                    _last_bytes_ts = None

            dt = max(0.0, now - store.last_poll_time)
            store.last_poll_time = now

            if streams_res is None:
                store.ome_api_fail_count += 1
                if store.ome_api_fail_count >= 6:
                    # ~12 ثانية بدون API → نعتبر البث توقف
                    with store.lock:
                        store.stream_meta["online"] = False
                        store.stream_meta["bw_in"] = 0
                        store.stream_meta["bw_out"] = 0
                        store.stream_meta["time_ms"] = 0
                    _last_bytes_received = None
                    _last_bytes_sent = None
                    _last_bytes_ts = None
                elif store.stream_meta.get("online") and store.stream_meta.get("started_at", 0) > 0:
                    # API مؤقتاً غير متاح — أبقِ الحالة وحدّث الوقت فقط
                    with store.lock:
                        store.stream_meta["last_active_time"] = now
                        store.stream_meta["time_ms"] = int((now - store.stream_meta["started_at"]) * 1000)
                        bw_in_current = store.stream_meta.get("bw_in", 0)
                        if bw_in_current > 0:
                            est_out = bw_in_current * len(store.viewers)
                            store.stream_meta["bw_out"] = est_out
                            store.stream_meta["bytes_in"] = store.stream_meta.get("bytes_in", 0) + int((bw_in_current / 8.0) * dt)
                            store.total_bytes_received = store.stream_meta["bytes_in"]
                            store.stream_meta["bytes_out"] = store.stream_meta.get("bytes_out", 0) + int((est_out / 8.0) * dt)
                            store.total_hls_bytes_sent = store.stream_meta["bytes_out"]
            elif online:
                store.ome_api_fail_count = 0
                # إن لم نتمكن بعد من قياس bitrate (أول poll) لا نفرض 6 Mbps وهمي —
                # نترك 0 حتى تأتي عيّنة ثانية ما لم تكن هناك قيمة سابقة.

                with store.lock:
                    store.stream_meta["online"] = True
                    store.stream_meta["started_at"] = started_at
                    store.stream_meta["last_active_time"] = now
                    store.stream_meta["time_ms"] = int((now - started_at) * 1000)
                    store.stream_meta["bw_in"] = bitrate

                    active_viewers = len(store.viewers)
                    # إن لم يتوفر bytesSent من OME، قدّر الإرسال بعدد المشاهدين
                    # (nginx يعكس HLS وقد لا يظهر كل المشاهدين في OME)
                    if bw_out <= 0:
                        bw_out = bitrate * active_viewers
                    store.stream_meta["bw_out"] = bw_out

                    store.stream_meta["bytes_in"] = store.stream_meta.get("bytes_in", 0) + int((bitrate / 8.0) * dt)
                    store.total_bytes_received = store.stream_meta["bytes_in"]
                    store.stream_meta["bytes_out"] = store.stream_meta.get("bytes_out", 0) + int((bw_out / 8.0) * dt)
                    store.total_hls_bytes_sent = store.stream_meta["bytes_out"]

                    # width/height = 0 → الواجهة تعرض N/A (OME لا يوفّر الدقة)
                    store.stream_meta["video"] = {"width": v_width, "height": v_height, "codec": v_codec}
                    store.stream_meta["audio"] = {"codec": a_codec, "samplerate": 48000}
            else:
                store.ome_api_fail_count = 0
                with store.lock:
                    store.stream_meta["online"] = False
                    store.stream_meta["bw_in"] = 0
                    store.stream_meta["bw_out"] = 0
                    store.stream_meta["time_ms"] = 0

            kbps = store.stream_meta.get("bw_in", 0) // 1000
            store.bw_history.append({"ts": int(time.time()), "kbps": kbps})
            if len(store.bw_history) > 120:
                store.bw_history.pop(0)
            cur = len(store.viewers)
            if cur > store.peak_viewers:
                store.peak_viewers = cur

            metrics.update_cpu_percent()
            track_session()

            # تعبئة مسبقة لذاكرة GeoIP للمشاهدين النشطين (غير حاجبة للطلبات)
            for _ip_addr in list(store.viewers.keys()):
                geoip.resolve_ip_country(_ip_addr)

        except Exception as e:
            import sys, traceback
            print(f"[POLLER LOOP ERROR]: {e}", file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
        time.sleep(2)


def start_poller():
    threading.Thread(target=poller, daemon=True).start()
