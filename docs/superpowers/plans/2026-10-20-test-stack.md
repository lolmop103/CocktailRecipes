# Test Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose -f docker-compose-test.yml up -d --build` runs production's own container behind the local edge Caddy, on `http://localhost:8290` and `https://<LAN_HOST>:8291`, for a demo on the home network.

**Architecture:** BinMark's local edge gets one site file and two ports for the stack. CocktailRecipes gets a compose file whose only service extends `compose.prod.yaml`'s `cocktail` and replaces the local parts (env, network, image tag, volume). No application code changes.

**Tech Stack:** Docker Compose 5.3 (`extends`, `!reset`, `!override`), Caddy 2.11 (`tls internal`), the existing production image (Node 22, Express 5, SQLite).

**Spec:** `docs/superpowers/specs/2026-10-20-test-stack-design.md`

## Global Constraints

- `docker-compose.yml` and `compose.prod.yaml` are not edited, in any task.
- No server, client or shared code changes.
- Names: project `cocktailrecipes-test`, service `app`, image `cocktailrecipes-test-app`, volume key `cocktail-db` (resolves to `cocktailrecipes-test_cocktail-db`), alias on `edge` `cocktailrecipes-test-app`.
- Ports: 8290 http, 8291 https and 8291/udp.
- `CLIENT_ORIGIN: https://${LAN_HOST:-localhost}:8291`; `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` interpolated from `.env` with `:?set ADMIN_… in .env`.
- Site block: `encode zstd gzip` + `reverse_proxy cocktailrecipes-test-app:3000`; https names `localhost` and `{$LAN_HOST}`, `tls internal`.
- Commits: Conventional Commits, human author only, no AI trailers or mentions.
- BinMark is worked on in its own git worktree (another session may be using the main BinMark checkout); never switch the branch of `C:\Users\lieve\Documents\LievensLingier\BinMark`.

## Review Focus

- The edge is recreated from the worktree to pick up new ports; the BinMark showcase (8190) and CurvyRoads test (8090) must still answer afterwards — pinned in Task 1, Step 6.
- A visitor at `https://localhost:8291` or `http://localhost:8290` must still browse; only edits are refused (403), never a blank page — pinned in Task 2, Step 6.
- `docker compose -f docker-compose-test.yml down -v` must not touch the `cocktail-prod-db` or `cocktailrecipes_cocktail-db` volumes, nor retag `cocktail:latest` — pinned in Task 2, Step 4.
- After the login check with a throwaway admin, the stack must run again with the owner's own credentials from `.env` — pinned in Task 2, Step 7.
- `.env` still parses for the dev stack after `LAN_HOST` is added (`docker compose config` of `docker-compose.yml` unchanged) — pinned in Task 2, Step 4.

---

## Branch 1 — BinMark `feat/edge-cocktailrecipes-test`

### Task 1: The local edge serves 8290/8291 for the stack

**Files** (in the worktree `C:\Users\lieve\Documents\LievensLingier\BinMark-edge-cocktail`):

- Create: `infra/edge/sites-local/cocktailrecipes-test.caddy`
- Modify: `infra/edge/compose.local.yml` (ports list, header stack list)
- Modify: `infra/edge/README.md` ("Local edge" table)

**Interfaces:**

- Produces: edge answers on host ports 8290/8291 and proxies to `cocktailrecipes-test-app:3000` on network `edge` (Task 2 joins it under that alias).

- [ ] **Step 1: Worktree.** `cd C:\Users\lieve\Documents\LievensLingier\BinMark && git fetch && git worktree add ..\BinMark-edge-cocktail -b feat/edge-cocktailrecipes-test origin/feat/edge-curvyroads-map`; copy the untracked `infra/edge/.env` (holds `LAN_HOST=192.168.0.191`) into the worktree's `infra/edge/`.
- [ ] **Step 2: Failing check.** `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8290/` — Expected: `000` (nothing listens).
- [ ] **Step 3: Implement.** Site file exactly as in spec §2 (header comment, snippet `(cocktailrecipes-test)`, `http://:8290`, `https://localhost:8291, https://{$LAN_HOST}:8291` with `tls internal`). In `compose.local.yml` add `"8290:8290"`, `"8291:8291"`, `"8291:8291/udp"` after the 8091 lines, and `#   8290/8291  Cocktail Recipes test (docker-compose-test.yml in the CocktailRecipes repo)` to the header list. README table row: `| 8290 / 8291 | Cocktail Recipes test | \`docker compose -f docker-compose-test.yml up -d --build\` (CocktailRecipes repo) |`.
- [ ] **Step 4: Validate** (from the worktree, map data from the main checkout):
  ```bash
  export EDGE_MAP_DATA=C:/Users/lieve/Documents/LievensLingier/BinMark/map-data
  docker compose -f infra/edge/compose.local.yml config -q
  docker compose -f infra/edge/compose.local.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
  ```
  Expected: no output from `config -q`; `Valid configuration`.
- [ ] **Step 5: Apply.** `docker compose -f infra/edge/compose.local.yml up -d` (same project `edge`, recreates Caddy with the new ports). Then `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8290/` — Expected: `502` (Caddy answers, no app yet).
- [ ] **Step 6: Neighbours still up.** `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8190/` and `http://localhost:8090/` — Expected: `200` each; `curl -sk -o /dev/null -w '%{http_code}\n' https://map.localhost:8443/styles/binmark.json` (or with `--resolve map.localhost:8443:127.0.0.1`) — Expected: `200`.
- [ ] **Step 7: Commit and PR.** `git commit -m "feat(edge): Cocktail Recipes' test stack on 8290/8291"`, push, `gh pr create --base feat/edge-curvyroads-map`; the body notes that the edge on this PC now runs from this worktree until the stack below merges.

---

## Branch 2 — CocktailRecipes `feat/test-stack`

### Task 2: `docker-compose-test.yml` and its docs

**Files** (in `C:\Users\lieve\Documents\LievensLingier\CocktailRecipes`):

- Create: `docker-compose-test.yml`
- Modify: `.env.example` (a `LAN_HOST` entry), `README.md` (section "Show it on your network", after "Docker"), `CLAUDE.md` ("Local environment" ports bullet, one "Current status" line)
- Local only, not committed: `.env` gets `LAN_HOST=192.168.0.191`

**Interfaces:**

- Consumes: Task 1's edge on 8290/8291 proxying to `cocktailrecipes-test-app:3000`.

- [ ] **Step 1: Branch.** `git switch -c feat/test-stack develop` (after `git pull`, so the spec and plan are in).
- [ ] **Step 2: Failing check.** `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8290/api/health` — Expected: `502`.
- [ ] **Step 3: Implement** `docker-compose-test.yml` exactly as spec §1, with a header comment in the siblings' style: what it is (production's container behind the local edge, not a deployment), start the edge first (`docker compose -f ../BinMark/infra/edge/compose.local.yml up -d`), `up -d --build`, the addresses and which one edits, `LAN_HOST` must equal the edge's, the certificate note, `down` keeps data / `down -v` resets to the eight classics. Add `LAN_HOST=192.168.0.191` to `.env`.
- [ ] **Step 4: Config checks.**
  - `docker compose -f docker-compose-test.yml config` (hash redacted when shown) — Expected: `image: cocktailrecipes-test-app`, `CLIENT_ORIGIN: https://192.168.0.191:8291`, `NODE_ENV: production`, `TRUST_PROXY_HOPS: "1"`, `init: true`, volume `name: cocktailrecipes-test_cocktail-db`, network `edge` external with alias `cocktailrecipes-test-app`, no `ports`, no `env_file`.
  - `docker compose config -q` (dev stack) and `docker compose -f compose.prod.yaml config -q` — Expected: no output, and `git diff --stat docker-compose.yml compose.prod.yaml` empty.
  - `ADMIN_USERNAME= docker compose -f docker-compose-test.yml config -q` — Expected: error containing `set ADMIN_USERNAME in .env`.
- [ ] **Step 5: Up.** `docker compose -f docker-compose-test.yml up -d --build`; `docker compose -f docker-compose-test.yml ps` within 60 s — Expected: `(healthy)`. `docker image ls cocktail` — Expected: `cocktail:latest` untouched (same id/created time as before). Record `docker stats --no-stream cocktailrecipes-test-app-1` memory in the PR.
- [ ] **Step 6: Edge checks.** With `LAN=https://192.168.0.191:8291`:
  - `/api/health` 200 on `http://localhost:8290`, `https://localhost:8291` (`-k`) and `$LAN` (`-k`); `curl -w '%{time_total}'` on 8290 ≤ 0.05 s; page `/` 200 on all three.
  - `POST $LAN/api/recipes` with `Origin: $LAN`, JSON `{}` → `401`; the same with `Origin: https://localhost:8291` → `403`.
  - `curl -sk --compressed -D - -o /dev/null -w '%{size_download}\n' $LAN/api/recipes` — Expected: `content-encoding: zstd` or `gzip`, size < 5000; repeating with its `ETag` in `If-None-Match` → `304`.
- [ ] **Step 7: Login check with a throwaway admin, then back to the owner's.**
  - `printf '%s\n%s\n' "$PW" "$PW" | npm run -s hash-password --workspace=server` with a random 20-char `$PW`; take the hash.
  - `ADMIN_USERNAME=check ADMIN_PASSWORD_HASH='<hash>' docker compose -f docker-compose-test.yml up -d` (shell values win over `.env`).
  - At `$LAN` with `Origin: $LAN`: `POST /api/auth/login` → 200 and a `__Host-cocktail_session` cookie; with it, `POST /api/recipes` (a minimal valid recipe, name `Test stack check`) → 201; `DELETE /api/recipes/<id>` → 204; `POST /api/auth/logout`.
  - `docker compose -f docker-compose-test.yml up -d` (no overrides) — Expected: the container is recreated, `docker compose -f docker-compose-test.yml exec app printenv ADMIN_USERNAME` prints the owner's name from `.env`.
- [ ] **Step 8: Docs.** `.env.example`: after `CADDY_NETWORK`, a commented `# LAN_HOST=192.168.0.10` with two lines: only `docker-compose-test.yml` reads it; this PC's IPv4 address, the same value as `LAN_HOST` in BinMark's `infra/edge/.env`. `README.md` "Show it on your network": the three commands, the address table from spec §3, the certificate note pointing to BinMark's `infra/edge/README.md` "Phones and other devices", `down` vs `down -v`. `CLAUDE.md`: add `CocktailRecipes test stack → 8290/8291 through BinMark's local edge (docker-compose-test.yml)` to the Docker ports bullet, and in "Current status" one line that the test stack exists.
- [ ] **Step 9: Gates.** `npm run verify` — Expected: green (Prettier covers the new YAML and Markdown). The other stacks: 3009, 8190, 8090 answer `200` on `/`.
- [ ] **Step 10: Commit and PR.** `git commit -m "chore(docker): test stack behind the local edge"`, push, `gh pr create --base develop`; the body lists the measured numbers (health time, compressed size), says it needs BinMark's `feat/edge-cocktailrecipes-test` on the machine, and asks the owner for the phone check: open `$LAN` on a phone on the Wi-Fi, browse, log in.
