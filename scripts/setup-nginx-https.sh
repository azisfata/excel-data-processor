#!/bin/bash

# Configure Nginx HTTPS reverse proxy using the SSL bundle stored in the repo.
# Run with sudo/root: sudo bash scripts/setup-nginx-https.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run this script with sudo/root privileges." >&2
  exit 1
fi

PROJECT_ROOT=${PROJECT_ROOT:-/home/fata/excel-data-processor}
SSL_DIR=${SSL_DIR:-"${PROJECT_ROOT}/SSL"}
ENV_FILE=${ENV_FILE:-"${PROJECT_ROOT}/.env"}
DOMAIN=${DOMAIN:-$(grep -E '^FRONTEND_HOST=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)}
FRONTEND_PORT=${FRONTEND_PORT:-$(grep -E '^FRONTEND_PORT=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)}
AUTH_PORT=${AUTH_SERVER_PORT:-$(grep -E '^AUTH_SERVER_PORT=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)}
ACTIVITY_PORT=${ACTIVITY_SERVER_PORT:-$(grep -E '^ACTIVITY_SERVER_PORT=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)}
WHATSAPP_PORT=${WHATSAPP_SERVER_PORT:-$(grep -E '^WHATSAPP_SERVER_PORT=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)}
CLIENT_MAX_BODY_SIZE=${CLIENT_MAX_BODY_SIZE:-15m}

DOMAIN=${DOMAIN:-sapa.kemenkopmk.go.id}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
AUTH_PORT=${AUTH_PORT:-3002}
ACTIVITY_PORT=${ACTIVITY_PORT:-3001}
WHATSAPP_PORT=${WHATSAPP_PORT:-3003}

function require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    echo "Required file not found: ${path}" >&2
    exit 1
  fi
}

require_file "${SSL_DIR}/fullchain.pem"
require_file "${SSL_DIR}/private.key"
require_file "${SSL_DIR}/cabundle.crt"

echo "[1/4] Setting ownership and permissions under ${SSL_DIR}"
chown root:root "${SSL_DIR}"/*
chmod 600 "${SSL_DIR}"/*.key
chmod 644 "${SSL_DIR}"/*.crt "${SSL_DIR}"/*.pem

MAP_FILE="/etc/nginx/conf.d/sapa-connection-upgrade.conf"
if [[ ! -f "${MAP_FILE}" ]]; then
  echo "[2/4] Installing connection upgrade helper map at ${MAP_FILE}"
  cat <<'EOF' > "${MAP_FILE}"
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF
else
  echo "[2/4] Skipping map creation (already exists at ${MAP_FILE})"
fi

SITE_CONF="/etc/nginx/sites-available/sapa.conf"
echo "[3/4] Writing Nginx server block to ${SITE_CONF}"
cat <<EOF > "${SITE_CONF}"
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     ${SSL_DIR}/fullchain.pem;
    ssl_certificate_key ${SSL_DIR}/private.key;
    ssl_trusted_certificate ${SSL_DIR}/cabundle.crt;

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
    }

    location /api/auth/ {
        proxy_pass http://127.0.0.1:${AUTH_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/activities/ {
        proxy_pass http://127.0.0.1:${ACTIVITY_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size ${CLIENT_MAX_BODY_SIZE};
    }

    location /activity-uploads/ {
        proxy_pass http://127.0.0.1:${ACTIVITY_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/wa/ {
        proxy_pass http://127.0.0.1:${WHATSAPP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "${SITE_CONF}" /etc/nginx/sites-enabled/sapa.conf

LEGACY_LINK="/etc/nginx/sites-enabled/excel-processor"
if [[ -L "${LEGACY_LINK}" || -f "${LEGACY_LINK}" ]]; then
  echo "[3b] Removing legacy site definition at ${LEGACY_LINK}"
  rm -f "${LEGACY_LINK}"
fi

echo "[4/4] Testing and reloading Nginx"
nginx -t
systemctl reload nginx

echo "HTTPS reverse proxy configured for ${DOMAIN}"
