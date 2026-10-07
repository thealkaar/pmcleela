# Oracle Cloud VM deployment

This deploys the existing Node.js API on an Ubuntu VM, with Nginx handling HTTPS and
WebSocket proxying. PostgreSQL and media storage remain external (Supabase and
Cloudflare R2); do not rely on the VM disk for production media.

## 1. Create the VM and network rules

1. In OCI, create an **Always Free eligible** Ubuntu 24.04 instance with a public
   IPv4 address. Verify the selected shape and any IP reservation charges in the
   OCI console; Always Free availability and capacity vary by region. The server's
   FFmpeg dependency supports both AMD64 and ARM64. If offered as Always Free,
   prefer an Ampere A1 Flex VM with at least 1 OCPU and 6 GB RAM; FFmpeg video
   processing can be demanding, and a 1 GB micro VM may run out of memory.
2. Add inbound TCP rules for ports **80** and **443** to the instance's network
   security group or subnet security list. Restrict SSH (TCP 22) to your own IP.
   Do not expose port 5000 publicly.
3. Create an `A` record such as `api.example.com` pointing to the VM's public IP.
   Replace that example domain below with the hostname you will use.

If you do not own a domain yet, you can use a free dynamic-DNS hostname (for
example, a DuckDNS subdomain) for an initial deployment. Point it at the VM's
public IP, then use that hostname everywhere the guide says
`api.your-domain.example`. If the DNS provider gives you an update token, keep it
out of the repository and restrict its file permissions. A domain you control is
preferable for a long-lived public app.

## 2. Install Node.js and Nginx

Connect over SSH, then install the system packages and Node.js 22:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

The Node version should be `v22.x`, as required by `server/package.json`.

If UFW is enabled, allow SSH and web traffic:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw status
```

## 3. Install the application and its service account

```bash
sudo useradd --system --home-dir /opt/pmcleela --no-create-home --shell /usr/sbin/nologin pmcleela
sudo install -d -o pmcleela -g pmcleela /opt/pmcleela
sudo -u pmcleela git clone https://github.com/thealkaar/pmcleela.git /opt/pmcleela
sudo -u pmcleela npm --prefix /opt/pmcleela/server ci
```

Create the protected configuration directory and edit `/etc/pmcleela/server.env`
with the production values below. Use the Supabase
transaction-pooler URI for `DATABASE_URL` and session-pooler URI for `DIRECT_URL`,
with the query parameters shown in the root README. Use unique random secrets of at
least 32 characters for both session secrets:

```bash
sudo install -d -o root -g pmcleela -m 0750 /etc/pmcleela
sudoedit /etc/pmcleela/server.env
```

```ini
NODE_ENV=production
PORT=5000
MAX_UPLOAD_MB=100
MAX_APP_RELEASE_MB=250
JSON_BODY_LIMIT=10mb
DATABASE_URL=
DIRECT_URL=
PMC_USER_SESSION_SECRET=
PMC_ADMIN_EMAIL=
PMC_ADMIN_PASSWORD=
PMC_ADMIN_SESSION_SECRET=
R2_BUCKET_NAME=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_SIGNED_URL_TTL_SECONDS=43200
BREVO_API_KEY=
FROM_EMAIL=
FROM_NAME="PMC Leela"
```

Set the four R2 credentials: production reels, avatars, and APK releases should live
in R2 rather than on the VM's local disk. Set `FROM_EMAIL` to a sender verified with
Brevo. Add `ANDROID_APP_SHA256_CERT_FINGERPRINTS` later if you want verified Android
App Links.

Protect the file, install the systemd unit, and start the API:

```bash
sudo chown root:pmcleela /etc/pmcleela/server.env
sudo chmod 0640 /etc/pmcleela/server.env
sudo install -m 0644 /opt/pmcleela/deploy/oracle-cloud/pmcleela.service /etc/systemd/system/pmcleela.service
sudo systemctl daemon-reload
sudo systemctl enable --now pmcleela
sudo systemctl status pmcleela
sudo journalctl -u pmcleela -n 100 --no-pager
```

`npm start` applies checked-in Prisma migrations before starting the API. Keep
`DATABASE_URL` and `DIRECT_URL` set and valid before enabling the service.

## 4. Configure Nginx and HTTPS

Update the `server_name` in the checked-in Nginx template, install it, and reload:

```bash
sudo sed 's/api.example.com/api.your-domain.example/' /opt/pmcleela/deploy/oracle-cloud/nginx.conf \
  | sudo tee /etc/nginx/sites-available/pmcleela
sudo ln -s /etc/nginx/sites-available/pmcleela /etc/nginx/sites-enabled/pmcleela
sudo nginx -t
sudo systemctl reload nginx
```

Install a Let's Encrypt certificate after the DNS record resolves to the VM:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.your-domain.example
sudo certbot renew --dry-run
```

Test the public health endpoint:

```bash
curl --fail https://api.your-domain.example/api/health
```

It should return HTTP 200 and `"status":"ok"`. If it does not, inspect
`sudo journalctl -u pmcleela` and the Nginx error log before building the app.

## 5. Point the Android build to the VM

In the Expo project's **preview** environment, add these non-secret variables in
Expo's dashboard under the project's environment variables:

- `EXPO_PUBLIC_API_URL=https://api.your-domain.example`
- `EXPO_PUBLIC_SHARE_URL=https://api.your-domain.example` (optional; defaults to
  the API URL)

The preview EAS profile selects this environment. The dynamic Expo config uses the
selected share/API hostname for Android's HTTPS `/reel` App Link, and the app uses
the API URL for REST and Socket.IO. Rebuild and install the student APK after
changing the backend URL:

```powershell
cd A:\pmcleela\mobile
npx eas-cli build --platform android --profile preview
```

For Android to verify `/reel` links, set
`ANDROID_APP_SHA256_CERT_FINGERPRINTS` in `/etc/pmcleela/server.env` to the
SHA-256 fingerprint of the APK's EAS signing certificate, then restart the service.
The Android intent filter will match the share hostname selected at build time.

## 6. Deploy future server updates

```bash
sudo -u pmcleela git -C /opt/pmcleela pull --ff-only
sudo -u pmcleela npm --prefix /opt/pmcleela/server ci
sudo systemctl restart pmcleela
sudo systemctl status pmcleela
```

Check the health endpoint after each deployment. Back up PostgreSQL and R2
independently; the VM is only the API host.
