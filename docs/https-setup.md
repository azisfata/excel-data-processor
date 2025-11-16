# HTTPS & Nginx Setup

Use this guide when you want to expose the stack over HTTPS using the SSL bundle stored in the `SSL/` folder (already versioned in the repo).

## 1. Prerequisites

- `pm2` services already configured via `ecosystem.config.cjs`.
- `.env` contains the production values (HTTPS URL, secure cookies, etc.). See `.env:1-38` for the example currently used on the server.
- The SSL assets exist in `SSL/`:
  - `fullchain.pem` (or `cert.crt + cabundle.crt`)
  - `private.key` (or `server.key`)

If your CA only supplied `cert.crt` and `cabundle.crt`, build `fullchain.pem`:

```bash
cat SSL/cert.crt SSL/cabundle.crt > SSL/fullchain.pem
```

## 2. Recommended ownership & permissions

```bash
PROJECT_ROOT="/home/fata/excel-data-processor"
sudo chown root:root "$PROJECT_ROOT"/SSL/*
sudo chmod 600 "$PROJECT_ROOT"/SSL/*.key
sudo chmod 644 "$PROJECT_ROOT"/SSL/*.crt "$PROJECT_ROOT"/SSL/*.pem
```

Only the Nginx worker (root during startup) should be able to read the private key.

## 3. Nginx reverse proxy (HTTPS termination)

Create `/etc/nginx/sites-available/sapa.conf` with the template below. Replace `PROJECT_ROOT` if the repo lives elsewhere.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name sapa.kemenkopmk.go.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sapa.kemenkopmk.go.id;

    ssl_certificate     /home/fata/excel-data-processor/SSL/fullchain.pem;
    ssl_certificate_key /home/fata/excel-data-processor/SSL/private.key;
    ssl_trusted_certificate /home/fata/excel-data-processor/SSL/cabundle.crt;

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend SPA assets (served by pm2 serve on port 5173)
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location /api/auth/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/activities/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 15m;
    }

    location /activity-uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/wa/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/sapa.conf /etc/nginx/sites-enabled/sapa.conf
sudo nginx -t
sudo systemctl reload nginx
```

> **Heads-up:** If you previously had another file in `/etc/nginx/sites-enabled/` that used the same `server_name` (e.g., `excel-processor`), remove that symlink (`sudo rm /etc/nginx/sites-enabled/excel-processor`) so only `sapa.conf` owns `sapa.kemenkopmk.go.id`. Otherwise Nginx will warn about a conflicting server name and keep the old behavior.

## 4. Restart Node services after env changes

Whenever `.env` changes (e.g., toggling `COOKIE_SECURE`), rebuild and reload PM2:

```bash
cd /home/fata/excel-data-processor
npm run build
pm2 reload all        # or pm2 reload sapa-auth sapa-activity sapa-wa excel-processor-frontend
pm2 save
```

## 5. Validation checklist

- `curl -I https://sapa.kemenkopmk.go.id` returns `HTTP/2 200`.
- Browser lock icon shows the correct certificate chain.
- `document.cookie` shows `Secure` cookies from the auth server.
- `pm2 logs sapa-auth` has no CORS errors (confirm `CORS_ORIGIN` matches the HTTPS origin).
- File uploads succeed (Nginx `client_max_body_size` matches backend limits).

Keep the SSL folder backed up safely—never commit private keys to a public repo. If this repository will be public, move the `SSL/` directory out of version control and add it to `.gitignore`.
