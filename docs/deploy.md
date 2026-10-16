# Deploying behind Caddy

Cocktail Recipes runs as one Docker container on a VPS, behind a Caddy you
already run in Docker. Caddy terminates HTTPS and compresses responses; the app
publishes no port of its own and is reached only over a shared Docker network.

```
visitor ──HTTPS──▶ Caddy ──http://cocktail:3000──▶ app container ──▶ SQLite (volume cocktail-prod-db)
```

## Prerequisites

- Docker with Compose v2 on the VPS.
- Your Caddy container attached to an external Docker network. This guide calls
  it `caddy`; if yours has another name, set `CADDY_NETWORK` (see below). Check
  with `docker network ls`.
- A DNS name for the site pointing at the VPS (below: `cocktails.example.com`).
- Nothing in front of Caddy: visitors connect to Caddy directly. If you put a CDN
  such as Cloudflare in front of it, set `TRUST_PROXY_HOPS=2` in `.env` —
  otherwise every visitor shares one rate-limit bucket (the CDN's address).
- Node 22+ on the machine where you create the password hash (your laptop is
  fine — the hash is what goes to the server, never the password).

## 0. Get the code on the VPS

```bash
git clone https://github.com/lolmop103/CocktailRecipes.git
cd CocktailRecipes
```

## 1. Create the admin password hash

```bash
npm ci
npm run hash-password --workspace=server
```

It asks for the password twice (at least 12 characters, nothing is echoed) and
prints one line:

```
ADMIN_PASSWORD_HASH='scrypt$32768$8$1$…$…'
```

Keep the single quotes when you paste it: Docker Compose would otherwise read
every `$` in the hash as a variable.

## 2. Write `.env` on the server

In the repository checkout on the VPS (never committed):

```bash
NODE_ENV=production
CLIENT_ORIGIN=https://cocktails.example.com
ADMIN_USERNAME=your-name
ADMIN_PASSWORD_HASH='scrypt$32768$8$1$…$…'
LOG_LEVEL=info
# Optional
SESSION_TTL_DAYS=30
CADDY_NETWORK=caddy
```

- `CLIENT_ORIGIN` must be the public `https://` address exactly as visitors type
  it, without a path. Every change to data is refused (403) unless the browser
  says it comes from this origin.
- The server refuses to start without `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`,
  and refuses a hash it cannot verify or one cheaper than `hash-password`
  makes — such as the public test-only hash in this repository.
- `compose.prod.yaml` sets `NODE_ENV`, `PORT`, `DATA_DIR` and
  `TRUST_PROXY_HOPS=1` itself; you do not need them in `.env`.
- Changing the password (a new hash and a restart) ends every open session.

## 3. Add the site to your Caddyfile

```caddyfile
cocktails.example.com {
	encode zstd gzip
	reverse_proxy cocktail:3000
}
```

Reload Caddy (`docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`
or however you normally do). Caddy obtains the certificate itself.

## 4. Start

```bash
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps      # STATUS shows (healthy) within a minute
```

The database is created and seeded with eight classics on first start; it lives
in the `cocktail-prod-db` volume and survives rebuilds.

## 5. Check it

```bash
# The site answers through Caddy, compressed
curl -fsS https://cocktails.example.com/api/health
# The first page is compressed by Caddy: expect `content-encoding: zstd` (or gzip)
# and a size well under 5,000 bytes
curl -s -D - -o /dev/null --compressed -w '%{size_download} bytes\n' \
  https://cocktails.example.com/api/recipes | grep -iE 'content-encoding|bytes'

# A repeat request is answered 304 with an empty body (ETag)
etag=$(curl -s -D - -o /dev/null https://cocktails.example.com/api/recipes | grep -i '^etag' | cut -d' ' -f2 | tr -d '\r')
curl -s -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $etag" https://cocktails.example.com/api/recipes   # → 304

# Changing data without logging in is refused
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Origin: https://cocktails.example.com' -H 'Content-Type: application/json' \
  -d '{}' https://cocktails.example.com/api/recipes        # → 401
```

Then open the site, choose **Log in**, and add a recipe.

## Updating

```bash
git pull
docker compose -f compose.prod.yaml up -d --build
```

Migrations run automatically at start; the data volume is kept.

## What protects the site

- Only the logged-in admin can change data; every write also needs the site's
  own `Origin` (cross-site requests are refused).
- Every read is bounded: at most 20 + 20 ingredient filters, 100 characters of
  search, pages of at most 48 recipes.
- Per client IP: 120 API reads and 60 writes a minute, 5 wrong passwords per
  15 minutes. Over a limit the answer is 429 with `Retry-After`.

What it does **not** stop: a flood from many IP addresses at once (a botnet).
No single app can; that has to be handled in front of it — by your VPS
provider's DDoS protection, or by Caddy with a rate-limit plugin.

## Backups (manual)

Automated backups are not part of this setup. The database lives in the
`cocktail-prod-db` volume as `cocktail.db` plus its write-ahead log
(`cocktail.db-wal`, `cocktail.db-shm`) — always copy them together, with the
app stopped:

```bash
docker compose -f compose.prod.yaml stop
docker run --rm -v cocktail-prod-db:/data -v "$PWD/backup":/backup alpine \
  sh -c 'cp -a /data/. /backup/'
docker compose -f compose.prod.yaml start
```

To restore, stop the app, copy the files back the same way (from `/backup` into
`/data`), and start it again.
