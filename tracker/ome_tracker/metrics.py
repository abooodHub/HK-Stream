"""قياس استهلاك الخادم: المعالج والذاكرة والقرص (عبر /proc و shutil)."""
import os, shutil

_last_cpu_total = 0
_last_cpu_idle = 0
cpu_percent = 0   # يُقرأ من handler عبر metrics.cpu_percent


def update_cpu_percent():
    global _last_cpu_total, _last_cpu_idle, cpu_percent
    try:
        if os.path.exists('/proc/stat'):
            with open('/proc/stat', 'r') as f:
                line = f.readline()
            parts = line.split()
            if len(parts) >= 5:
                user = int(parts[1])
                nice = int(parts[2])
                system = int(parts[3])
                idle = int(parts[4])
                total = user + nice + system + idle

                diff_total = total - _last_cpu_total
                diff_idle = idle - _last_cpu_idle

                if diff_total > 0:
                    cpu_percent = int((1.0 - (diff_idle / diff_total)) * 100)

                _last_cpu_total = total
                _last_cpu_idle = idle
        else:
            cpu_percent = 5
    except Exception:
        pass


def get_ram_usage():
    try:
        if os.path.exists('/proc/meminfo'):
            mem = {}
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 2:
                        mem[parts[0].replace(':', '')] = int(parts[1])
            total = mem.get('MemTotal', 1)
            free = mem.get('MemFree', 0) + mem.get('Buffers', 0) + mem.get('Cached', 0)
            used = total - free
            pct = int((used / total) * 100)
            return {"total_mb": total // 1024, "used_mb": used // 1024, "percent": pct}
        else:
            return {"total_mb": 16000, "used_mb": 4000, "percent": 25}
    except Exception:
        return {"total_mb": 0, "used_mb": 0, "percent": 0}


def get_disk_usage():
    try:
        total, used, free = shutil.disk_usage("/")
        return {
            "total_gb": total // (1024**3),
            "used_gb": used // (1024**3),
            "percent": int((used / total) * 100),
        }
    except Exception:
        return {"total_gb": 0, "used_gb": 0, "percent": 0}


def get_server_uptime():
    """مدة تشغيل الخادم بالثواني منذ آخر إقلاع (من /proc/uptime)."""
    try:
        with open('/proc/uptime', 'r') as f:
            return int(float(f.readline().split()[0]))
    except Exception:
        return 0
