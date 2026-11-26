# Deploying behind Caddy

> **Source of truth for the server.** On the shared VPS, the server setup (baseline,
> shared Caddy edge, deploys by image digest, secrets, backups, restore drills) belongs
> to [server-ops-kit](https://github.com/lolmop103/server-ops-kit), the only thing that
> changes the server. This page keeps app knowledge only: what the app needs (see
> "Server needs" below) and how to run it by hand. The numbered steps and the Caddyfile
> snippet are for a hand-run setup with your own Caddy, not for the shared server.

Cocktail Recipes runs as one Docker container on a VPS, behind a Caddy you
already run in Docker. Caddy terminates HTTPS and compresses responses; the app
publishes no port of its own and is reached only over a shared Docker network.

```
visitor ──HTTPS──▶ Caddy ──http://cocktail:3000──▶ app container ──▶ SQLite (volume cocktail-prod-db)
```

On the shared edge the upstream is the alias `cocktailrecipes-cocktail:3000` instead
(see "Server needs"); `cocktail` is the name for a Caddy you run yourself.

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
SESSION_TTL_DAYS=14
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

## 3. Add the site to your Caddyfile (hand-run Caddy only)

The shared edge uses a site file the kit ships, not this snippet.

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
- Per client IP: 120 API reads and 60 writes a minute. Over a limit the answer
  is 429 with `Retry-After`.
- Login: 3 free wrong attempts, then a flat 30 s cooldown shared by everyone
  (not keyed on the client IP, no lockout). During it the answer is 429 with
  `Retry-After`. It resets after a correct login or 15 minutes without attempts.

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

## Server needs

What the app needs from the server, for server-ops-kit to provide and verify. Catalog
format pending: this is a plain list under the skill's headings; the kit converts it.
Values the owner has not decided are placeholders.

- **Ports and exposure:** the `cocktail` service listens on 3000 inside the container.
  Internal only: no published port; the edge reaches it over the shared Docker network.
- **Domain:** one hostname, routed to `cocktailrecipes-cocktail:3000`, the service's alias on the shared
  network (placeholder `COCKTAIL_DOMAIN`, supplied by the kit; no domain is written in
  this repository).
- **Env vars** (template: `.env.example`; real values only on the server):
  - secret: `ADMIN_PASSWORD_HASH` (scrypt hash made with `hash-password`), delivered
    through the compose `env_file`;
  - `ADMIN_USERNAME`;
  - `CLIENT_ORIGIN`: the public `https://` origin, no path (placeholder until the domain
    is decided);
  - `TRUST_PROXY_HOPS`: 1 behind Caddy alone, 2 with Cloudflare in front (placeholder
    until the owner decides); the server refuses to start without it;
  - `SESSION_TTL_DAYS=14` (the default; remove any old `30`; sessions already stored
    keep their old expiry until the next login);
  - `LOG_LEVEL=info`, `CADDY_NETWORK` (the kit sets it to `edge`; the service joins it
    with the alias `cocktailrecipes-cocktail`);
  - optional `COCKTAIL_IMAGE`: the released image, pinned by digest (default: local build);
  - set by the compose itself: `NODE_ENV`, `PORT`, `DATA_DIR`.
- **Volumes and data:** the named volume `cocktail-prod-db` at `/data`: `cocktail.db`
  plus its write-ahead log. Small (the measured run had 1000 recipes; check on real data after
  launch); it only grows with recipes. The only writable places in the container are
  `/data` and a 16 MB `/tmp`.
- **Resource limits:** memory 128m with no swap (peak 80 MB measured), 1 CPU (3.9 % of a
  core on average, 1.14 in a flood), 128 pids (peak 23). Starting values from a measured
  run on small data; the kit reports real values back.
- **Health endpoint:** `GET /api/health`, 200 when the app is up; expected well under 100 ms
  (p95 15-28 ms during a single-IP flood, measured 2026-10-16).
- **Backup job and restore check:** the snapshot command
  `node server/dist/scripts/snapshot.js` writes one consistent `cocktail.db` to
  `/data/snapshots/` while the app runs. Backup member: `cocktail.db`. `/data/snapshots`
  holds one file (`cocktail.db`), rewritten at each snapshot and removed by the backup
  job after the copy, so it is not pruned and does not grow. Frequency and the restore
  drill are the kit's, running BinMark's `infra/backup` scripts; they depend on
  BinMark's kit request R1 (a CocktailRecipes member is optional there).
- **Scheduled jobs:** n/a — the app has none; the snapshot is run by the kit's backup job.
- **Must NOT be exposed:** to the public: port 3000, `/data` and `/data/snapshots` (only the backup job reads the latter), the `.env` file.
- **Startup and shutdown:** the container restarts by itself (`restart: unless-stopped`)
  and runs migrations at start. On SIGTERM the app finishes in-flight requests, with a
  force timer at 8 s; `stop_grace_period` is 10 s. A deploy swap is a short restart
  (SQLite rules out two containers at once).

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
