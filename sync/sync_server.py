#!/usr/bin/env python3
"""
OME Stream Sync Server (stdlib only + websockets)
Fetches LLHLS live edge from OME and broadcasts to all connected WebSocket viewers.
All viewers receive the same reference → play at the same moment.
"""

import asyncio
import json
import time
import logging
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')
log = logging.getLogger("sync")

# ── Config ──────────────────────────────────────────────
SYNC_PORT = 9998
HTTP_PORT = 9997
OME_HLS_BASE = "http://127.0.0.1:8010"
CHECK_INTERVAL = 1.0

# ── State ───────────────────────────────────────────────
streams: dict = {}  # key → {"live_edge": float, "updated": float}
viewers: set = set()
loop: asyncio.AbstractEventLoop = None


# ── HLS Parser ──────────────────────────────────────────
def parse_llhls_playlist(text: str) -> float:
    total = 0.0
    last_part_dur = 0.0
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF:"):
            try:
                d = float(line.split(":")[1].split(",")[0])
                total += d
            except Exception:
                pass
        elif line.startswith("#EXT-X-PART:"):
            try:
                dur = float(line.split("DURATION=")[1].split(",")[0].split()[0])
                last_part_dur = dur
            except Exception:
                pass
    return max(total + last_part_dur, 1.0)


def fetch_live_edge(stream_key: str) -> float:
    """Synchronous fetch of the LLHLS live edge."""
    try:
        url = f"{OME_HLS_BASE}/{stream_key}/master.m3u8"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2) as resp:
            master = resp.read().decode()

        variant_path = None
        for line in master.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and line.endswith(".m3u8"):
                variant_path = line
                break

        if not variant_path:
            return streams.get(stream_key, {}).get("live_edge", 6.0)

        variant_url = f"{OME_HLS_BASE}/{stream_key}/{variant_path}"
        req2 = urllib.request.Request(variant_url)
        with urllib.request.urlopen(req2, timeout=2) as resp2:
            variant = resp2.read().decode()

        return parse_llhls_playlist(variant)

    except Exception as e:
        log.warning(f"fetch_live_edge error for {stream_key}: {e}")
        return streams.get(stream_key, {}).get("live_edge", 6.0)


# ── Background poller ───────────────────────────────────
async def poller_loop():
    while True:
        try:
            # Auto-discover active streams by trying common keys
            to_check = list(streams.keys()) or ["app/stream"]
            for sk in to_check:
                edge = await loop.run_in_executor(None, fetch_live_edge, sk)
                if sk not in streams:
                    streams[sk] = {"live_edge": edge, "updated": time.time()}
                    log.info(f"Auto-discovered stream: {sk}")
                else:
                    streams[sk]["live_edge"] = edge
                    streams[sk]["updated"] = time.time()

            # Broadcast
            if viewers:
                msg = json.dumps({
                    "type": "sync",
                    "streams": {
                        sk: {"live_edge": s["live_edge"]}
                        for sk, s in streams.items()
                    },
                    "ts": time.time()
                })
                stale = set()
                for ws in viewers:
                    try:
                        await ws.send(msg)
                    except Exception:
                        stale.add(ws)
                viewers.difference_update(stale)

        except Exception as e:
            log.error(f"poller error: {e}")

        await asyncio.sleep(CHECK_INTERVAL)


# ── WebSocket server (websockets lib) ───────────────────
async def ws_handler(websocket):
    viewers.add(websocket)
    log.info(f"Viewer connected ({len(viewers)} total)")
    try:
        # Send current state
        if streams:
            msg = json.dumps({
                "type": "sync",
                "streams": {
                    sk: {"live_edge": s["live_edge"]}
                    for sk, s in streams.items()
                },
                "ts": time.time()
            })
            await websocket.send(msg)

        # Listen for messages
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "register":
                    sk = data.get("stream_key", "app/stream")
                    if sk not in streams:
                        streams[sk] = {"live_edge": 6.0, "updated": time.time()}
                        log.info(f"Stream registered via WS: {sk}")
                        edge = await loop.run_in_executor(None, fetch_live_edge, sk)
                        streams[sk]["live_edge"] = edge
                        streams[sk]["updated"] = time.time()
            except Exception:
                pass
    except Exception:
        pass
    finally:
        viewers.discard(websocket)
        log.info(f"Viewer disconnected ({len(viewers)} total)")


# ── HTTP API for tracker hooks ──────────────────────────
class SyncAPIHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b'{}'
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        if self.path == '/publish':
            sk = data.get("stream_key", "")
            if sk:
                edge = fetch_live_edge(sk)
                streams[sk] = {"live_edge": edge, "updated": time.time()}
                log.info(f"Stream published: {sk}")
                # Broadcast update to viewers
                if loop and not loop.is_closed():
                    asyncio.run_coroutine_threadsafe(_broadcast(), loop)
            self._respond(200, {"ok": True})

        elif self.path == '/unpublish':
            sk = data.get("stream_key", "")
            if sk and sk in streams:
                del streams[sk]
                log.info(f"Stream unpublished: {sk}")
                if loop and not loop.is_closed():
                    asyncio.run_coroutine_threadsafe(_broadcast(), loop)
            self._respond(200, {"ok": True})

        elif self.path == '/health':
            self._respond(200, {
                "ok": True,
                "viewers": len(viewers),
                "streams": list(streams.keys())
            })
        else:
            self._respond(404, {"error": "not found"})

    def do_GET(self):
        if self.path == '/health':
            self._respond(200, {
                "ok": True,
                "viewers": len(viewers),
                "streams": list(streams.keys())
            })
        else:
            self._respond(404, {"error": "not found"})

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # suppress default logging


async def _broadcast():
    if not viewers:
        return
    msg = json.dumps({
        "type": "sync",
        "streams": {
            sk: {"live_edge": s["live_edge"]}
            for sk, s in streams.items()
        },
        "ts": time.time()
    })
    stale = set()
    for ws in viewers:
        try:
            await ws.send(msg)
        except Exception:
            stale.add(ws)
    viewers.difference_update(stale)


def run_http_server():
    server = HTTPServer(('127.0.0.1', HTTP_PORT), SyncAPIHandler)
    log.info(f"HTTP API on :{HTTP_PORT}")
    server.serve_forever()


# ── Main ────────────────────────────────────────────────
async def main():
    global loop
    loop = asyncio.get_running_loop()

    # Start HTTP API in background thread
    http_thread = Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # Start poller
    poller = asyncio.create_task(poller_loop())
    log.info(f"Poller started (interval={CHECK_INTERVAL}s)")

    # Start WebSocket server
    try:
        import websockets
        async with websockets.serve(ws_handler, "0.0.0.0", SYNC_PORT):
            log.info(f"WebSocket sync server on :{SYNC_PORT}")
            await asyncio.Future()  # run forever
    except Exception as e:
        log.error(f"WebSocket server error: {e}")
        # Fallback: run without websockets, just HTTP API
        log.info("Running in HTTP-only mode")
        await asyncio.Future()


if __name__ == "__main__":
    log.info(f"Sync server starting")
    asyncio.run(main())
