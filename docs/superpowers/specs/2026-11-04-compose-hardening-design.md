# Compose hardening — design

Date: 2026-11-04 · Status: draft, awaiting review

Go-public audit of 2026-11-02, work package 3. Model: BinMark's WP5
(`docs/superpowers/specs/2026-11-04-compose-hardening-design.md` in the BinMark repository).

## Purpose

Make a compromised or runaway app container on the shared server cheap: hard memory,
CPU and process ceilings, no extra privileges, a read-only root filesystem with only the
data volume writable, rotated logs, and application code the app cannot overwrite. A
CI check keeps it that way. Nothing is deployed yet, so no live data is converted.

## Findings from the current code

- `compose.prod.yaml`: one service `cocktail` with `init: true` and `restart`, no
  limits, no `no-new-privileges`, no `cap_drop`, no read-only root, no log rotation.
  It takes the whole `.env` through `env_file`.
- `Dockerfile` runner stage: already `USER node`, but `chown -R node:node /data /app`
  makes the application code writable by that user.
- The server writes only under `DATA_DIR` (`/data`): the SQLite files (WAL included)
  and `snapshots/` from the backup command (`server/src/lib/snapshot.ts`,
  `data/connection.ts`). It does not use `/tmp`.
- `docker-compose.yml` (local stack) publishes `${HOST_PORT:-3009}:3000` on every
  interface.
- `docker-compose-test.yml` (the owner's test stack behind the local edge) extends
  production's service and replaces only the local parts, so it inherits whatever
  `compose.prod.yaml` gains. The edge reaches it over the Docker network
  (`cocktailrecipes-test-app:3000`), not over a published port.
- CI's `configs` job runs `docker compose config -q` on the three files and asserts
  nothing about hardening.

## Decisions (locked)

| # | Topic | Decision | Rationale / cost if wrong |
|---|---|---|---|
| 1 | Privileges | `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, nothing added back | The app listens on 3000 as `node` and needs no capability. Cost if wrong: the container fails to start; add back the one capability found, never drop the rule |
| 2 | Filesystem | `read_only: true`; `/data` stays the volume; `tmpfs: /tmp` of 16 MB with `noexec,nosuid` | A compromised process cannot write code or binaries. A path found by the smoke run gets a `tmpfs` entry, never an exception to `read_only` |
| 3 | Limits | `mem_limit` with `memswap_limit` equal (no swap), `cpus`, `pids_limit`. Starting values 256m, 0.5, 128; final values = measured peak plus 30 % | The server shares a VPS with other apps. The numbers are shown to the owner before the PR |
| 4 | Logs | `json-file`, `max-size: 10m`, `max-file: "3"` | A runaway log cannot fill the disk; 30 MB at most |
| 5 | Code ownership | Runner stage: `chown node:node /data` only; `/app` stays root-owned | A compromised app process cannot rewrite its own code. Cost if wrong: something writes under `/app`; the smoke run finds it |
| 6 | Environment | `env_file` stays (owner's choice) | Single service, all variables are the app's. Cost: host-only values in `.env` also reach the container; the owner accepts it |
| 7 | Local stack | `docker-compose.yml` publishes `127.0.0.1:${HOST_PORT:-3009}:3000`; no `BIND_ADDR` | LAN devices go through the edge at `https://<LAN_HOST>:8291`, which does not use this port |
| 8 | Test stack | `docker-compose-test.yml` is not edited; it inherits the hardening at its next recreate, which the owner does | Gives a real stack to try the hardening; the CI script asserts it still inherits `read_only` and `cap_drop` |
| 9 | Guard | `scripts/check-compose-prod.sh` in the `configs` job between the `# project:` markers | A later edit that drops a hardening key fails CI. The script itself is tested against weakened copies of the file |
| 10 | Measurement | Built image on a throwaway stack (own project name, free port, temporary volume), never the owner's stacks | Limits come from numbers, not guesses |

## Measurement (decision 10)

- Build the image; run it with `compose.prod.yaml`'s hardening under the project name
  `cocktail-hardening-check`, a free host port (override only the port for the check)
  and a temporary volume; remove all of it afterwards.
- Seed through the app (or a seeded database file in the volume), then drive requests:
  list, search, filter by owned bottles, recipe detail, a bulk create, and the snapshot
  command (`node server/dist/scripts/snapshot.js`) at the same time. `scripts/load-probe.mjs`
  runs the server in-process, so it informs the read path but is not a container
  measurement; the plan decides how much of it to reuse.
- Record peak memory and CPU from `docker stats`. Final limits = peak plus 30 %.
- Behaviour under `read_only`: the container becomes healthy, a login works, a recipe
  saves, the client is served, the snapshot writes `/data/snapshots/cocktail.db`.
  `docker inspect` shows `no-new-privileges`, the dropped capabilities, the limits,
  `ReadonlyRootfs` and the log options.

## The CI script (decision 9)

`scripts/check-compose-prod.sh [compose-file]` renders the file with
`docker compose --env-file <empty> config --format json` and dummy values, so a
repository `.env` cannot hide a `:?` guard. For the `cocktail` service it asserts:
`no-new-privileges`; `cap_drop` is `ALL` and `cap_add` is absent; `read_only` is true;
`mem_limit`, `memswap_limit` (equal), `cpus` and `pids_limit` are set; the only
writable mounts are the `/data` volume and a `/tmp` `tmpfs`; log rotation is set;
`init` is true; no published ports; rendering fails without `TRUST_PROXY_HOPS`. It
also renders `docker-compose-test.yml` and asserts it still has `read_only` and
`cap_drop`, and checks the Dockerfile runner stage has no `chown -R` of `/app`. One
violation per output line, exit 1 on any. Its test feeds weakened copies (each key
removed in turn) and expects failure for each.

## Efficiency budget

| Resource | Number | How the design meets it | Verified by |
|---|---|---|---|
| Network per action | No change | Only runtime flags change | n/a — no code path changes; smoke run |
| Network while idle | None added | No timers or polling | n/a — nothing new runs |
| CPU and memory (server) | Limits = measured peak plus 30 % (starting 256m, 0.5 CPU, 128 pids) | Hard caps in compose | `docker stats` during the measurement run; numbers in the PR |
| Startup, storage | Health ready as before; log disk at most 30 MB; `/tmp` 16 MB | Rotation, capped `tmpfs` | Smoke run; `docker inspect` |
| Client bundle, rendering | n/a — no client change | | |

## Error cases

- A required variable missing: compose already fails through `:?` (checked by the script).
- A path the app writes outside `/data` and `/tmp`: the smoke run finds it; fix with a `tmpfs` entry.
- The measured peak exceeds the starting values: the final numbers are higher; shown to the owner first.
- The test stack is recreated with the new file: if it fails there, the smoke run missed a path; the owner reports it and the fix is a `tmpfs` entry.

## Testing bar

- `scripts/check-compose-prod.sh` passes on the new files and fails on each weakened copy.
- `docker compose config` renders all three compose files in CI (the existing step stays).
- Smoke run on the built image under the hardening: healthy, login, recipe save, client served, snapshot written.
- The existing server and client suites stay green; `pnpm lint` and the type check are clean.
- The throwaway stack, image and volume are removed afterwards.

## Documentation

`docs/deploy.md`: a short "Container hardening" paragraph (what is limited, how to raise a
limit, that `/tmp` is the only other writable path). `CLAUDE.md` "Current status & next
steps" (also refreshing the outdated text there). The handoff table marks package 3 done in
the branch's last PR.

## Out of scope

The edge, per-app networks and trusted proxies (package 6); deploy docs rewrite
(package 7); image publishing, digest pins and scanning (package 8); the app code; the
backup scripts; changing the test stack's own file; `seccomp` or AppArmor profiles;
rootless Docker.

## Risks and open points

- `read_only` can break something that writes outside `/data` and `/tmp` (a native module or library cache). The smoke run is the guard; the fix is a `tmpfs` entry.
- Limits measured on a small database; recheck on real data after launch.
- The test stack inherits the hardening at its next recreate; if it misbehaves there, the owner should say so before assuming the production file is wrong.
- Host-only values in `.env` also reach the container through `env_file` (decision 6, accepted).
