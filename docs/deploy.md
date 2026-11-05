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
  such as Cloudflare in front of it, set `TRUST_PROXY_HOPS=2` in `.env` instead of 1 —
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
pnpm install --frozen-lockfile
pnpm --filter cocktail-server hash-password
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
TRUST_PROXY_HOPS=1   # 2 if Cloudflare sits in front of Caddy
ADMIN_USERNAME=your-name
ADMIN_PASSWORD_HASH='scrypt$32768$8$1$…$…'
LOG_LEVEL=info
# Optional
SESSION_TTL_DAYS=30
CADDY_NETWORK=caddy
```

- `CLIENT_ORIGIN` must be the public `https://` address exactly as visitors type
  it, without a path, and must be `https://`. Every change to data is refused (403) unless the browser
  says it comes from this origin.
- The server refuses to start without `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`,
  and refuses a hash it cannot verify or one cheaper than `hash-password`
  makes — such as the public test-only hash in this repository.
- `compose.prod.yaml` sets `NODE_ENV`, `PORT` and `DATA_DIR` itself; you do not
  need them in `.env`. It no longer sets `TRUST_PROXY_HOPS`: it refuses to start
  until you set it in `.env`.
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

## Container hardening

`compose.prod.yaml` runs the container with the least it needs: no Linux
capabilities, no privilege escalation (`no-new-privileges`), a read-only root
filesystem and a log capped at 3 files of 10 MB. The only writable places are the
data volume (`/data`) and a 16 MB `/tmp` (`noexec`, `nosuid`); the app's code under
`/app` is owned by root, so the app process cannot rewrite it.

Limits, from a measured run (1000 recipes, reads, bulk creates, the snapshot
command in a loop and a 20 s flood; see "Measured" in
`docs/superpowers/specs/2026-11-04-compose-hardening-design.md`):

| Limit                                               | Value | Measured                                                              |
| --------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| `mem_limit` and `memswap_limit` (equal, so no swap) | 128m  | peak 80 MB for the whole container, the server alone about 52 MiB     |
| `cpus`                                              | 1.0   | 3.9 % of a core on average, 1.14 cores in a flood with the cap lifted |
| `pids_limit`                                        | 128   | peak 23 processes                                                     |

The +30 % margin was deliberately not applied to `cpus`: 1.14 cores was seen only in a
20 s abusive flood with the cap lifted. 1.0 (about one core) lets normal work run
unthrottled and is meant to bite under abuse.

The database in that run was small; check `docker stats` on real data after launch.
To raise a limit, edit `mem_limit` and `memswap_limit` (keep them equal), `cpus` or
`pids_limit` in `compose.prod.yaml`, then apply it:

```bash
docker compose -f compose.prod.yaml up -d
```

The local stack (`docker-compose.yml`) publishes its port on loopback only
(`127.0.0.1`), so nothing on the network reaches it directly. The test stack
(`docker-compose-test.yml`) is not edited; it picks the hardening up the next time
it is recreated.

## Backups

The nightly encrypted off-site backup is described in
`docs/superpowers/specs/2026-11-04-backups-design.md`. The image carries its
snapshot command (`node server/dist/scripts/snapshot.js`, which writes a single
consistent `cocktail.db` to `/data/snapshots/` while the app runs); the host job,
its setup and the restore steps live in BinMark's `infra/backup/README.md`. Until
that job is installed and its restore drill has passed, there is no automated
backup.

### Manual copy

The database lives in the `cocktail-prod-db` volume as `cocktail.db` plus its
write-ahead log (`cocktail.db-wal`, `cocktail.db-shm`) — always copy them
together, with the app stopped:

```bash
docker compose -f compose.prod.yaml stop
docker run --rm -v cocktail-prod-db:/data -v "$PWD/backup":/backup alpine \
  sh -c 'cp -a /data/. /backup/'
docker compose -f compose.prod.yaml start
```

To restore, stop the app, copy the files back the same way (from `/backup` into
`/data`), and start it again.
