# Off-site encrypted backups — design

Date: 2026-11-04 · Status: draft, awaiting review

## Purpose

The app's only copy of its data is a Docker volume on one VPS. A disk failure, a bad
deploy, a deleted volume or a compromised server loses every recipe, and the same
host will hold BinMark's database and photos. Before the apps are public, every data
set on the host has to be copied off the server every night, encrypted, in a way a
stolen server key cannot destroy, and one restore has to have been proven.

This is work package 5 of the go-public hardening audit of 2026-11-02, and BinMark's
security work package 7 (the same job). One spec covers both apps, because the
storage, encryption, retention, token and restore decisions must not drift apart.

**Success means**

- Every night one encrypted archive holding CocktailRecipes' SQLite database, BinMark's
  Postgres dump and BinMark's photos is stored in a bucket at another provider than
  the VPS.
- 7 daily, 4 weekly and 12 monthly copies are kept; older ones expire on their own.
- A key stolen from the VPS can add backups but cannot delete or overwrite one, and
  cannot read any of them.
- The owner is mailed when a night is missed, and once a month when it is time to copy
  the archives to a local drive.
- One restore, from the bucket into scratch targets, has been run end to end and its
  result recorded.

## Decisions (locked)

| Decision                                                                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare R2 holds the backups                                                           | Another provider than the VPS. The owner already has a Cloudflare account. About $0 per month at this size: 10 GB of storage free, then $0.015 per GB-month, egress free (third-party price summaries, to be confirmed on Cloudflare's page when the bucket is created). Cost if wrong: one Cloudflare account compromise reaches site and backups.                                                                                                                                                                                                                                                                                     |
| Dated encrypted archives, not a restic or borg repository                                 | R2 has no write-but-not-delete token, so append-only comes from bucket locks. A deduplicating repository deletes its own lock files and reuses old packs, so it cannot be age-expired and pruning would need the lock lifted. The data is small enough that full copies are fine.                                                                                                                                                                                                                                                                                                                                                       |
| One archive per night, built even when nothing changed                                    | A missing file on a quiet day would be indistinguishable from a failed job, and retention goes by file age, so an unchanged copy that is not re-uploaded would expire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `age` encryption with a public key on the VPS                                             | The server can encrypt but never decrypt. The private key lives only in the owner's password manager and on paper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Retention: `daily/` 8 days, `weekly/` 29 days, `monthly/` 395 days                        | Gives 7 daily, 4 weekly and 12 monthly copies. A bucket lock per prefix (daily 7, weekly 28, monthly 395 days) blocks delete and overwrite for the VPS token for almost the whole life of each copy; a lifecycle rule expires the file at the end. The monthly lock was raised from 30 to 395 days on 2026-11-04 after review: the VPS token is Object Read & Write, so a 30-day lock would have let a stolen key delete 11 of the 12 monthly copies. Cost: a monthly copy cannot be deleted early without removing the lock rule in the Cloudflare dashboard. Values are confirmed against Cloudflare's rule syntax in the first task. |
| Weekly and monthly copies are server-side copies of the night's daily upload              | One upload per night, whatever the tier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Three credentials, never mixed                                                            | VPS: an R2 object token scoped to the one bucket. Owner's machine: a second, separate object token that can delete, used only by the pull script. Bucket lock and lifecycle rules: edited in the Cloudflare dashboard by login, with no token on the VPS.                                                                                                                                                                                                                                                                                                                                                                               |
| Failure alert and monthly reminder: two healthchecks.io checks                            | `backup` expects a ping every day (alert after 26 h) and also catches a dead VPS or a cron that never ran. `local-copy` expects the owner's pull script to ping once a month (alert after 35 days). No extra mail or push service.                                                                                                                                                                                                                                                                                                                                                                                                      |
| The CocktailRecipes snapshot uses better-sqlite3 `db.backup()`                            | The database runs in WAL mode; copying `cocktail.db` alone is unsafe while the app runs. `backup()` yields a consistent single file without stopping the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Host scripts live in BinMark `infra/backup/`; the snapshot command lives in this image    | The host, the cron and the BinMark data already belong to the shared-host repo; only the SQLite snapshot needs the app's code and dependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Tools: `age` and `rclone`, installed from the OS repositories and recorded in the runbook | Both are single purpose and well known. No custom code talks to R2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Stop condition.** In the live drill, the VPS token must fail to delete and to overwrite
a locked object. If it can, the work stops and returns to the owner; the lock is not
replaced by a weaker setup to make the test pass.

**Added after the branch review (2026-11-04).**

- An existing object counts as "already backed up" only if its server-side modification
  time falls on the expected UTC date (month for `monthly/`); otherwise the run fails,
  so a planted future-dated object cannot suppress a night.
- `verify-bucket.sh` proves the lock on every prefix (`daily/`, `weekly/`, `monthly/`),
  not only `daily/`.
- `pull-local.sh` accepts only the expected object names and fails when the newest daily
  is more than two days old by server time, an independent check against a forged
  success ping.
- The heavy commands run under `nice` inside their containers, and the upload is
  bounded to a handful of requests per night.
- The runbook states that the VPS token can delete an object once its lock ends, that
  `age` does not authenticate the sender, and what to do after a compromise.

## Starting point

- `server/src/data/connection.ts` opens `${DATA_DIR}/cocktail.db` with
  `journal_mode = WAL` and runs the migrations on import.
- `server/src/scripts/hashPassword.ts` is the existing one-off script; it is compiled
  into `server/dist/scripts/` by `tsconfig.build.json` and the image copies `dist`.
- `compose.prod.yaml` names the data volume `cocktail-prod-db`. The container is named
  by its service, `cocktail`.
- `docs/deploy.md` has a manual "Backups" section (stop the app, copy the volume).
- BinMark's `docker-compose.prod.yml` has `binmark-pgdata` and `binmark-photos`; the
  manual `pg_dump` and photo `tar` commands are in its deploy runbook.
- WP3 will make the container read-only with `/data` the only writable path; the
  snapshot therefore writes under `/data`.

## Behaviour

### Snapshot command (this repository)

`node server/dist/scripts/snapshot.js`, run with `docker exec cocktail …`:

1. Opens `${DATA_DIR}/cocktail.db` read-only and requires it to exist.
2. Calls `db.backup()` into `${DATA_DIR}/snapshots/cocktail.db`, replacing any earlier
   file.
3. Opens the copy and runs `PRAGMA integrity_check`; anything but `ok` is an error.
4. Prints the path and exits 0. Any error exits non-zero with one line on stderr.

It does not import `connection.ts`, so it never migrates or creates a database and
leaves the app's start path unchanged.

### Nightly job (host, BinMark `infra/backup/backup.sh`)

Cron at 03:00 UTC, low CPU and IO priority, with a `flock` so two runs never overlap.

1. Create a staging directory (mode 700). A trap removes it on any exit.
2. Run the snapshot command and `docker cp` the file out; remove the snapshot in the
   container.
3. `pg_dump -Fc` of BinMark's database, and a `tar` of the photos volume.
4. Bundle the three into one `tar`, encrypt with `age` to the public recipient, and
   upload as `daily/YYYY-MM-DD.tar.age`.
5. On Sundays copy it server-side to `weekly/YYYY-MM-DD.tar.age`; on the 1st of the
   month to `monthly/YYYY-MM.tar.age`.
6. Ping the `backup` check. An error at any step pings the check's `/fail` URL with the
   step's name and exits non-zero. Silence also alerts.

A second run on the same UTC day finds the daily object and exits 0 without uploading.
The archive size is checked after step 4: over 400 MB the upload stands but the run
pings `/fail` with the size, so the owner revisits the photo approach before the free
storage runs out.

### Bucket

One private bucket, no public access, no custom domain. Lock and lifecycle rules per
prefix as in the decisions table. Created and configured by the owner in the Cloudflare
dashboard; the settings are written into the runbook so they can be re-created.

### Restore (BinMark `infra/backup/restore.sh`)

`restore.sh <object> <identity-file>` downloads one archive with the owner's token,
decrypts it with the private key the owner passes in, unpacks it into a scratch
directory and checks:

- the SQLite copy passes `integrity_check` and holds at least one recipe;
- the Postgres dump loads into a throwaway container and a row count of BinMark's
  places table is printed;
- one photo opens (file signature check).

It prints a report and never touches the production volumes. Restoring production is a
documented manual procedure (stop the app, copy back, start), not a script.

### Local copy (owner's machine, `infra/backup/pull-local.sh`)

Run monthly under Git Bash with `rclone`. It copies any archive not yet on the local
drive, verifies sizes, then pings the `local-copy` check. Local files stay encrypted,
so a lost drive leaks nothing without the private key. The owner deletes old local
copies by hand when they choose. Bucket copies expire on their own; deleting one early
means removing its prefix's lock rule in the dashboard first.

## Files

| Path                                                       | Repo            | Change                                                                              |
| ---------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `server/src/scripts/snapshot.ts`, `server/tests/…`         | CocktailRecipes | the snapshot command and its tests                                                  |
| `server/package.json`, knip config                         | CocktailRecipes | a `snapshot` script and a knip entry for the new script                             |
| `docs/deploy.md`                                           | CocktailRecipes | the manual "Backups" section points at the runbook and keeps the stop-and-copy path |
| `AGENTS.md`, `CLAUDE.md`                                   | CocktailRecipes | backups removed from the "not set up" lists; current-status paragraph               |
| `infra/backup/backup.sh`, `restore.sh`, `pull-local.sh`    | BinMark         | the scripts, with `shellcheck` clean                                                |
| `infra/backup/README.md`, `backup.env.example`, cron entry | BinMark         | setup, bucket rules, key handling, restore and local-copy routine                   |
| security work package table, server checklist §7           | BinMark         | ticked when the drill has passed                                                    |

No migration, no API change, no change to `packages/shared`.

## Error cases

| Case                                          | Result                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Database file missing or unreadable           | snapshot exits non-zero; the run pings `/fail`; nothing is uploaded                 |
| `integrity_check` fails on the copy           | same; the earlier good backups stay                                                 |
| App container not running                     | same; the other two data sets are not uploaded either, so a night is all or nothing |
| `pg_dump` or photo tar fails                  | same                                                                                |
| R2 unreachable or the upload is refused       | same, after one retry                                                               |
| Not enough free disk to stage                 | the run stops before dumping, with the free and needed sizes in the `/fail` message |
| Cron never runs, or the VPS is down           | no ping within 26 h; healthchecks.io mails the owner                                |
| Same-day re-run                               | exits 0 without uploading                                                           |
| VPS token tries to delete or overwrite a lock | refused by R2; this is the expected result and is the drill's pass condition        |
| Owner never pulls the local copy              | no ping within 35 days; healthchecks.io mails the owner                             |

## Efficiency budget

| Resource                          | Budget (number)                                                                           | How the design meets it                                            | How it is verified                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Requests per user action          | 0 added; no endpoint, no client change                                                    | the snapshot is a command, not a route                             | no server route test changes; `git diff` shows no change under `routes/` or `client/` |
| Requests while idle               | 0 added; the app runs no backup timer                                                     | scheduling is the host's cron                                      | existing `e2e/idle.spec.ts` unchanged                                                 |
| Snapshot of the SQLite file       | ≤ 2 s and ≤ 50 MB extra memory for a database up to 20 MB; no request fails while it runs | `db.backup()` copies in page steps and WAL readers are not blocked | server test running the snapshot while queries run; peak memory recorded in the PR    |
| Image size and start time         | image grows by < 50 KB; server start path unchanged                                       | one extra compiled file, not imported by `index.ts`                | `docker images` before and after in the PR; start path asserted by the existing tests |
| Nightly upload size               | ≤ 400 MB per archive, one upload per night                                                | weekly and monthly are server-side copies; over 400 MB alerts      | script test with a stub bucket asserts one upload; size check asserts the alert       |
| Nightly job time and load         | ≤ 10 min for 400 MB; runs at `nice 19`, idle IO priority                                  | streaming tar to `age`; one run at a time via `flock`              | timed in the live drill, result in the PR                                             |
| Host disk while running           | ≤ 2 × the archive size staged, freed on exit                                              | staging directory with a trap; free-space check before dumping     | script test that the trap removes staging on a forced failure                         |
| Bucket storage                    | ≤ 10 GB free tier at 24 copies of ≤ 400 MB; otherwise about $0.015 per GB-month           | lifecycle expiry per prefix                                        | `rclone size` on the bucket in the drill; monthly check by the local pull             |
| R2 operations                     | ≤ 10 write operations per night (free tier: 1 million per month)                          | one upload, up to two copies, one list                             | counted in the script test                                                            |
| Battery, client bundle, rendering | n/a — server and host work only, no client or mobile code changes                         | –                                                                  | –                                                                                     |

## Testing

- **Snapshot (Vitest, temp directory):** produces a database with the same rows; works
  while another connection writes; fails on a missing file; fails when the copy is
  corrupted; never writes outside `${DATA_DIR}/snapshots`. `pnpm verify` stays green
  with the 80% coverage gate and knip.
- **Scripts:** `shellcheck` clean. Integration tests run `backup.sh` and `restore.sh`
  against a local S3-compatible container with a scratch bucket, an `age` test key
  and a throwaway Postgres: success path, each error row above, same-day re-run,
  trap clean-up.
- **Live drill (after BinMark's server baseline, WP6, is done):** install on the host;
  run one backup; run the verification step that the VPS token cannot delete or
  overwrite a locked object; run `restore.sh` into scratch targets from the owner's
  machine with the private key from the password manager; pull a local copy; confirm
  both healthchecks go green; deliberately skip a night once to see the alert. The
  result is recorded in the PR. A backup that was never restored does not count.

## Owner actions (not agent work)

- Create the Cloudflare R2 bucket, the two object tokens and the lock and lifecycle rules.
- Create the healthchecks.io account and the two checks.
- Generate the `age` key pair on the owner's machine; store the private key in the
  password manager and on paper.
- Name the retention periods (about 30 days for daily and weekly, 12 months for monthly)
  in the privacy policy (BinMark's GDPR package).

## Out of scope

- A NAS or second off-site copy; whole-server snapshots from the VPS provider.
- Deduplication, restic and borg; photos in object storage (BinMark's optional WP12).
- Uptime checks beyond the backup ping; monitoring of the app.
- Automatic restore to production; point-in-time recovery.
- Handling user erasure requests inside old backups (belongs to the GDPR package).
- Installing the cron before the server baseline (WP6) is in place.
