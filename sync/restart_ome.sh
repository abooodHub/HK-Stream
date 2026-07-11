#!/bin/bash
# Kill old OME
killall OvenMediaEngine 2>/dev/null
sleep 2

# Start with log capture
cd /opt/ovenmediaengine/bin
nohup ./OvenMediaEngine -c origin_conf > /tmp/ome.log 2>&1 &
echo "Started OME PID: $!"
sleep 5

# Check
echo "=== LOG ==="
tail -50 /tmp/ome.log
echo "=== STATUS ==="
pgrep -la OvenMediaEngine
echo "=== RTMP PORT ==="
ss -tlnp | grep 1935
