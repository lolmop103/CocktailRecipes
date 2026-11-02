# Test stack behind the local edge — design

Date: 2026-10-20 · Status: draft, awaiting review

## Purpose

Run the whole app on the owner's PC exactly as it runs in production, behind the
same shared edge Caddy the other apps use, so friends on the home network can open
it on their phones over HTTPS. A demo and a check, never a deployment.

**Success means**

- `docker compose -f docker-compose-test.yml up -d --build` starts the app behind the
  local edge (BinMark: `infra/edge/compose.local.yml`), started and reached the same
  way as BinMark's showcase and CurvyRoads' test stack.
- `http://localhost:8290` works on the PC; `https://<LAN_HOST>:8291` works on any
  device on the network; the owner can log in and edit at that LAN address.
- The container is production's own definition: same build (under its own image tag), settings, init and
  restart policy. Only the local parts differ.
- `docker-compose.yml` and `compose.prod.yaml` are not changed, and the development
  stack (`:3009`) and the other apps' test stacks keep running next to it.

## Starting point

- Production (`compose.prod.yaml`): one container, `cocktail`, in which Express serves
  the API and the built client, with SQLite on the volume `cocktail-prod-db`. It joins
  the external network `${CADDY_NETWORK:-caddy}` and reads `.env` through `env_file`.
  It does not join the shared edge's network `edge`, and no edge site file points at it.
- BinMark showcase and CurvyRoads test: their own project and volumes, no host ports,
  public services on `edge` under `<app>-<stack>-<service>` aliases, one
  `infra/edge/sites-local/<app>-<stack>.caddy` in BinMark on an http port and the next
  one for https (`localhost` and `LAN_HOST`, Caddy's own CA). Their separate `web`
  container exists only because a Flutter web build needs a file server; BinMark's
  production has no web container at all.
- The local edge is running on this machine with `LAN_HOST=192.168.0.191`
  (`BinMark/infra/edge/.env`). `sites-local/` exists only on BinMark's open stacked
  branches (#58 → #59 → #60, head `feat/edge-curvyroads-map`).

## Decisions (locked)

| #   | Decision                                                                                                                                                                                                 | Rationale                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A new `docker-compose-test.yml`. `docker-compose.yml` and `compose.prod.yaml` are not edited.                                                                                                            | Owner's requirement: only changes needed to run a test.                                                                                                                                                     |
| D2  | Its one service `app` **extends** `compose.prod.yaml`'s `cocktail` and replaces only the local parts (`env_file`, `networks`, image tag, volume).                                                        | The test stack is production by construction; a later change to production reaches it with no second edit. Same pattern as BinMark's `compose.local.yml` extending the server's `compose.yml`.              |
| D3  | One container, API and web together. No separate web container, no database container.                                                                                                                   | Production has exactly this shape; SQLite is a file on the volume. A Caddy web container would make the test stack differ from the server.                                                                  |
| D4  | `CLIENT_ORIGIN = https://${LAN_HOST:-localhost}:8291`; `LAN_HOST` comes from CocktailRecipes' own `.env`.                                                                                                | The server accepts writes from one origin only. The LAN address is the one every device can use, the owner's phone included. Allowing several origins would be an app change (owner's choice: LAN address). |
| D5  | `env_file: !reset []`; the environment is set in the file. `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are interpolated from `.env` with `:?` errors, as `docker-compose.yml` does.                       | `.env` holds development values (`PORT=3000`, `CLIENT_ORIGIN=…:5173`, `DATA_DIR=./server/data-store`) that would break production mode. The owner's real hash, never a demo hash in a public repo.          |
| D6  | Project `cocktailrecipes-test`, image `cocktailrecipes-test-app`, volume `cocktail-db` declared without a fixed name (→ `cocktailrecipes-test_cocktail-db`), alias `cocktailrecipes-test-app` on `edge`. | Never touches production's `cocktail:latest` tag or the `cocktail-prod-db` volume; follows the edge's alias rule.                                                                                           |
| D7  | Edge ports 8290 (http) / 8291 (https and HTTP/3).                                                                                                                                                        | Next free pair after CurvyRoads 8090/8091 and BinMark 8190/8191; free on this machine (checked 2026-10-20).                                                                                                 |
| D8  | The site file is `encode zstd gzip` + `reverse_proxy cocktailrecipes-test-app:3000`, the same block as production's in `docs/deploy.md`.                                                                 | Same proxy behaviour as on the server; nothing routes by path because the one container serves everything.                                                                                                  |
| D9  | The BinMark change goes on a new branch `feat/edge-cocktailrecipes-test` from `feat/edge-curvyroads-map`, PR'd into that branch.                                                                         | `sites-local/` and the LAN_HOST site form only exist there; stacking keeps each PR one step.                                                                                                                |

## Design

### 1. CocktailRecipes: `docker-compose-test.yml`

```yaml
name: cocktailrecipes-test

services:
  app:
    extends:
      file: compose.prod.yaml
      service: cocktail
    image: cocktailrecipes-test-app
    env_file: !reset []
    environment:
      CLIENT_ORIGIN: https://${LAN_HOST:-localhost}:8291
      ADMIN_USERNAME: ${ADMIN_USERNAME:?set ADMIN_USERNAME in .env}
      ADMIN_PASSWORD_HASH: ${ADMIN_PASSWORD_HASH:?set ADMIN_PASSWORD_HASH in .env}
    networks: !override
      default: {}
      edge:
        aliases: [cocktailrecipes-test-app]

volumes:
  cocktail-db: {}

networks:
  edge:
    external: true
    name: edge
```

From production it keeps the build, `init: true`, `restart: unless-stopped`,
`NODE_ENV=production`, `PORT=3000`, `DATA_DIR=/data`, `TRUST_PROXY_HOPS=1` and the
image's health check. A header comment gives the start commands, the addresses, the
`LAN_HOST` key and the certificate note, in the style of the siblings' files.
`docker compose config` on this shape was checked on 2026-10-20 (Compose 5.3.0).

Other CocktailRecipes files:

- `.env.example`: a `LAN_HOST` entry (commented out) explaining that it is this PC's
  IPv4 address, the same value as in the edge's `.env`, used only by the test stack.
- `README.md`: a "Show it on your network" section — start the edge, start the stack,
  the addresses, which address can edit, the certificate, `down` vs `down -v`.
- `CLAUDE.md` "Local environment": the test stack's ports 8290/8291 next to the other
  projects' ports. "Current status" gets one line.
- The owner's `.env` (local, never committed) gets `LAN_HOST=192.168.0.191`.

### 2. BinMark: the local edge

- `infra/edge/sites-local/cocktailrecipes-test.caddy`:

  ```caddyfile
  # Cocktail Recipes test stack (docker-compose-test.yml in the CocktailRecipes repo): one
  # container serves the API and the web app, as in production.
  #   http://<any host>:8290           plain HTTP; browsing only (edits need the LAN address)
  #   https://localhost:8291, https://LAN_HOST:8291        Caddy's own CA
  (cocktailrecipes-test) {
  	encode zstd gzip
  	reverse_proxy cocktailrecipes-test-app:3000
  }

  http://:8290 {
  	import cocktailrecipes-test
  }

  https://localhost:8291, https://{$LAN_HOST}:8291 {
  	tls internal
  	import cocktailrecipes-test
  }
  ```

- `infra/edge/compose.local.yml`: publish `8290:8290`, `8291:8291`, `8291:8291/udp`;
  one line in the header's stack list.
- `infra/edge/README.md`: one row in the "Local edge" table.

New ports recreate the edge Caddy (`up -d`, a few seconds for every local stack).

### 3. Using it

```bash
docker compose -f ../BinMark/infra/edge/compose.local.yml up -d   # first, if not running
docker compose -f docker-compose-test.yml up -d --build
# PC:      http://localhost:8290
# network: https://192.168.0.191:8291  (log in here to edit)
```

| Address                   | Browse | Log in and edit          |
| ------------------------- | ------ | ------------------------ |
| `https://<LAN_HOST>:8291` | yes    | yes                      |
| `https://localhost:8291`  | yes    | no (403, origin differs) |
| `http://localhost:8290`   | yes    | no (403, origin differs) |

Friends click through the certificate warning once; browsing needs no sensors. The
owner's phone trusts the edge's root certificate once (BinMark `infra/edge/README.md`,
"Phones and other devices") so the `__Host-` session cookie and the login work without
warnings. `down` keeps the data; `down -v` resets it to the eight seeded classics.

## Error cases

| Case                                                        | Result                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| The edge is not running (no network `edge`)                 | `up` refuses: network `edge` declared as external, but could not be found |
| `ADMIN_USERNAME` or `ADMIN_PASSWORD_HASH` missing in `.env` | `up` refuses with "set ADMIN_… in .env"                                   |
| A weak or test-only hash in `.env`                          | the app exits at start (production refuses it)                            |
| `LAN_HOST` missing                                          | edits only from `https://localhost:8291`                                  |
| `LAN_HOST` differs from the edge's                          | the LAN address answers, but edits there get 403 — keep the two equal     |
| Edit from another address                                   | 403 "Cross-site request refused"                                          |
| Stack up, edge site file not loaded                         | edge answers nothing on 8290/8291 until its `up -d`                       |

## Efficiency budget

| Resource                   | Budget (number)                                                                    | How the design meets it                     | How it is verified                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Network per action         | First recipe page ≤ 5,000 bytes through the edge's compression; repeat request 304 | Production's ETags; `encode zstd gzip` (D8) | `curl --compressed` size and `content-encoding` on `https://localhost:8291/api/recipes`; ETag → 304 |
| Network while idle         | 0 requests — unchanged                                                             | No app change                               | Existing e2e `idle.spec.ts` (unchanged code)                                                        |
| Location / sensors         | n/a                                                                                | —                                           | —                                                                                                   |
| CPU / server               | `/api/health` through the edge ≤ 50 ms                                             | One reverse proxy hop on the same machine   | `curl -w '%{time_total}'` on 8290, recorded in the PR                                               |
| Rendering                  | n/a — no client change                                                             | —                                           | —                                                                                                   |
| Battery                    | n/a — no client change                                                             | —                                           | —                                                                                                   |
| Startup / memory / storage | Same build as production; healthy within 60 s of `up`; one volume                  | `extends` the production service            | `docker compose -f docker-compose-test.yml ps` shows `(healthy)`; `docker stats --no-stream`        |

## Testing bar

No application code changes, so no new unit or e2e tests. Verification is by running:

- `docker compose -f docker-compose-test.yml config` resolves: environment as in D2/D5,
  volume `cocktailrecipes-test_cocktail-db`, network `edge` with the alias.
- `caddy validate` on the edge config in a throwaway container (BinMark README, "Add an
  app", step 5, with `compose.local.yml`).
- With the edge and the stack up: `/api/health` 200 on `http://localhost:8290`,
  `https://localhost:8291` and `https://<LAN_HOST>:8291`; anonymous `POST /api/recipes`
  with the LAN origin → 401; the same with `Origin: https://localhost:8291` → 403;
  log in at the LAN address, create a recipe, delete it; compressed size and 304.
- The development stack (`:3009`), the BinMark showcase (8190) and the CurvyRoads test
  stack (8090) still answer after the edge restart.
- `npm run verify` stays green (Prettier checks the new YAML and Markdown).
- On a phone on the network: open the LAN address, browse, log in (owner's phone).

## Delivery

1. Spec (this file) and plan, pushed directly to `develop` in CocktailRecipes.
2. BinMark `feat/edge-cocktailrecipes-test` from `feat/edge-curvyroads-map`: site file,
   ports, README row. PR into `feat/edge-curvyroads-map`.
3. CocktailRecipes `feat/test-stack` from `develop`: `docker-compose-test.yml`,
   `.env.example`, `README.md`, `CLAUDE.md`. PR into `develop`. It needs the BinMark
   branch on the machine to be reachable; the PR says so.

## Out of scope

- Any change to `docker-compose.yml` or `compose.prod.yaml`.
- Moving production onto the shared edge (`CADDY_NETWORK=edge`, a
  `sites/cocktailrecipes.caddy`, an `<app>-<service>` alias): a later production change
  of its own.
- Several allowed origins, or any other server or client change.
- Reaching the stack from outside the home network (tunnels, port forwarding).
- Demo data beyond the eight seeded classics.
