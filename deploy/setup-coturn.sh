#!/bin/bash
set -e

SECRET=$(openssl rand -hex 32)
PASS=$(openssl rand -hex 16)

cat > /etc/turnserver.conf << EOF
# Coturn Configuration for WebRTC TURN relay
listening-port=3478
tls-listening-port=5349

# listening-ip must be 0.0.0.0 for VPS
listening-ip=0.0.0.0

# Relay IP
relay-ip=85.190.101.80
external-ip=85.190.101.80/85.190.101.80

# Realm and domain
realm=aboodfull2.site
server-name=aboodfull2.site

# Authentication
use-auth-secret
static-auth-secret=${SECRET}

# Turn credentials
user=stream:${PASS}

# Security
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1

# Logging
log-file=/var/log/turnserver.log
verbose

# Relay range
relay-min-port=10000
relay-max-port=10100

# Favor UDP
fingerprint
lt-cred-mech
EOF

echo "TURN_SECRET=${SECRET}"
echo "TURN_PASS=${PASS}"

# Enable coturn service
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Start coturn
sudo systemctl enable coturn
sudo systemctl restart coturn
sleep 2
sudo systemctl status coturn --no-pager -l | head -10
echo "Coturn setup complete!"
