# Compose hardening — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. In this repository tasks go to `task-implementer` (Tasks 1, 3, 4) or `task-transcriber` (Task 2, complete code), each reviewed by `task-reviewer`, and the branch ends with `branch-reviewer`.

**Goal:** Harden the production container (privileges, read-only root, limits, log rotation, root-owned code), bind the local stack to loopback, and guard it with a CI script.

**Architecture:** One branch, one PR. A guard script and its test come first and fail on the current file; the compose and Dockerfile edits make it pass; a measurement run on a throwaway stack sets the final limits; docs close it.

**Tech Stack:** Docker Compose, a POSIX shell script with a small `node` assertion step (Node 24 is on the runner), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-04-compose-hardening-design.md` (on `develop`).

## Global Constraints

- Branch `chore/compose-hardening`, cut from `develop`, one PR into `develop`; the owner merges. No push without telling the owner.
- Never start, stop, recreate or edit the owner's stacks: `docker-compose-test.yml` (project `cocktailrecipes-test`), the local edge, the dev map. Checks use their own project name `cocktail-hardening-check`, a free port and a temporary volume, and are removed afterwards.
- `docker-compose-test.yml` is not edited (it extends `compose.prod.yaml`).
- `env_file` stays in `compose.prod.yaml`.
- Starting values: `mem_limit` and `memswap_limit` `256m`, `cpus` `0.5`, `pids_limit` `128`; final values are the measured peak plus 30 % and are shown to the owner before the PR is opened.
- `/tmp` is a `tmpfs` of 16 MB with `noexec,nosuid`; log rotation `json-file` with `max-size: 10m`, `max-file: "3"`.
- The repository is public: no personal data, no private references in commits or docs. Agent bookkeeping (`tasks/`, `kb/`) stays untracked.
- Commits conventional, no AI attribution. `pnpm verify` stays green.

## Review Focus

1. A missing `TRUST_PROXY_HOPS` still fails the render (the script asserts it, Task 1).
2. The snapshot command works under `read_only` and writes `/data/snapshots/cocktail.db` while the app serves requests (Task 3).
3. Each hardening key removed in turn makes the script fail (Task 1's test).
4. The test stack's rendered config still has `read_only` and `cap_drop` (the script, Task 1).
5. Data written before a `docker restart` is still there afterwards, and `docker stop` is still immediate (init under the pids limit) (Task 3).

---

### Task 1: The guard script and its test (red first)

**Files:**

- Create: `scripts/check-compose-prod.sh`, `scripts/check-compose-prod.test.sh`
- Modify: `.github/workflows/ci.yml` (the `configs` job, between `# project: begin` and `# project: end`; the `changes` filter must also trigger on `scripts/check-compose-prod*` and `Dockerfile` if it does not already)

**Interfaces:**

- Produces: `scripts/check-compose-prod.sh [compose-file] [test-compose-file] [dockerfile]` (defaults `compose.prod.yaml`, `docker-compose-test.yml`, `Dockerfile`): prints one `FAIL: <reason>` line per violation, exit 1 on any, `OK` and exit 0 otherwise. `scripts/check-compose-prod.test.sh`: exit 0 when the guard passes on the real files and fails on every weakened copy.

- [ ] **Step 1: Write `check-compose-prod.test.sh`.** It copies the compose file to a temp dir once per rule, removes that one rule with `sed`/`node`, runs the guard on the copy and expects exit 1 with the rule's `FAIL:` text. Rules: `no-new-privileges`, `cap_drop`, `read_only`, `mem_limit`, `memswap_limit`, `cpus`, `pids_limit`, `tmpfs`, `logging`, `init`, a published `ports` entry added, `cap_add` added, the `TRUST_PROXY_HOPS:?` guard weakened to a default, the Dockerfile `chown -R ... /app` restored. It also asserts the guard passes on the real files. Name each case in its output.
- [ ] **Step 2: Run** `bash scripts/check-compose-prod.test.sh`. Expected: FAIL (the guard does not exist, then the real file lacks the keys).
- [ ] **Step 3: Write `check-compose-prod.sh`.** Render with `docker compose --env-file <empty temp file> -f <file> config --format json`, with `COCKTAIL_ENV_FILE` pointing at an empty temp file and `TRUST_PROXY_HOPS=1` set; assert the service `cocktail` as listed in the spec's "The CI script" section using a `node -e` step over the JSON (the implementer checks how compose renders `tmpfs`, `mem_limit` and `memswap_limit`, and compares them after normalising). A second render without `TRUST_PROXY_HOPS` must fail. Render the test stack's file the same way and assert its service has `read_only` true and `cap_drop` containing `ALL`. Grep the Dockerfile runner stage for `chown -R` on `/app`.
- [ ] **Step 4: Wire it into CI.** In the `configs` job add a step `Production compose is hardened` running `bash scripts/check-compose-prod.sh` and one running `bash scripts/check-compose-prod.test.sh`, both between the `# project:` markers; extend the `changes` filter if needed.
- [ ] **Step 5: Run** `bash scripts/check-compose-prod.sh` on the unchanged repository. Expected: FAIL lines for every missing hardening key (this proves it can fail). Run `shellcheck` if available. Commit `test: guard script for the hardened production compose file`.

### Task 2: Harden the files (green)

**Files:**

- Modify: `compose.prod.yaml`, `Dockerfile` (the runner stage line `RUN mkdir -p /data && chown -R node:node /data /app`), `docker-compose.yml` (the `ports` line)

**Interfaces:**

- Consumes: Task 1's guard.
- Produces: a compose file that passes the guard, with the starting values from the Global Constraints.

- [ ] **Step 1: Edit `compose.prod.yaml`.** In service `cocktail`, after `init: true` and before `restart`, add:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
read_only: true
tmpfs:
  - /tmp:size=16m,noexec,nosuid
mem_limit: 256m
memswap_limit: 256m
cpus: 0.5
pids_limit: 128
logging:
  driver: json-file
  options:
    max-size: 10m
    max-file: '3'
```

Extend the header comment with one line: hardened, limits measured, see `docs/deploy.md`.

- [ ] **Step 2: Edit the `Dockerfile`:** `RUN mkdir -p /data && chown node:node /data`, with a comment saying the code under `/app` stays root-owned on purpose.
- [ ] **Step 3: Edit `docker-compose.yml`:** the ports line becomes `'127.0.0.1:${HOST_PORT:-3009}:3000'`, with a comment that LAN devices go through the edge.
- [ ] **Step 4: Run** `bash scripts/check-compose-prod.test.sh` and `bash scripts/check-compose-prod.sh`; run `docker compose -f docker-compose.yml config -q`, `-f docker-compose-test.yml config -q` and `-f compose.prod.yaml config -q` with the CI dummy variables. Expected: all pass.
- [ ] **Step 5: Commit** `feat: harden the production container`.

### Task 3: Measure on a throwaway stack and set the final limits

**Files:**

- Modify: `compose.prod.yaml` (final `mem_limit`, `memswap_limit`, `cpus`, and any `tmpfs` path found); `docs/superpowers/specs/2026-11-04-compose-hardening-design.md` (a "Measured" section with the numbers)

**Interfaces:**

- Consumes: Task 2's files.
- Produces: final limit values and the measured numbers (peak memory, peak CPU) for the PR body.

- [ ] **Step 1: Build and start the check stack** with the hardened file under project name `cocktail-hardening-check`, a free host port added only for this check (an override file in the scratchpad, not committed), a temporary volume and a throwaway `.env` outside the repository (admin hash made with the repository's `hash-password` script, `TRUST_PROXY_HOPS=0`, `CLIENT_ORIGIN` matching the port). Expected: the container becomes healthy.
- [ ] **Step 2: Behaviour under `read_only`:** log in, create and read back a recipe, load the client page, run `docker compose ... exec cocktail node server/dist/scripts/snapshot.js` and confirm `/data/snapshots/cocktail.db` exists (Review Focus 2). Any write error means a `tmpfs` entry, never an exception to `read_only`.
- [ ] **Step 3: Restart check** (Review Focus 5): `docker restart`, confirm the recipe is still there; `docker stop` returns in about a second.
- [ ] **Step 4: Load and measure:** drive list, search, owned-bottle filter, detail and a bulk create (a short Node script in the scratchpad against the throwaway stack; reuse parts of `scripts/load-probe.mjs` only if it helps) while the snapshot command runs; record peak memory and CPU from `docker stats`.
- [ ] **Step 5: Set the final values** (peak plus 30 %, rounded up to a sensible step, never below the starting value without a note), verify with `docker inspect` (`NoNewPrivileges`, `CapDrop`, `ReadonlyRootfs`, `Memory`, `NanoCpus`, `PidsLimit`, log config), re-run the guard and its test, then **stop and tell the owner the numbers before continuing**.
- [ ] **Step 6: Remove the check stack:** `docker compose -p cocktail-hardening-check down -v`, the temporary image, the throwaway `.env` and override. Confirm with `docker ps -a` and `docker volume ls` that nothing of it is left and that the owner's stacks were not touched. Commit `chore: set measured limits for the production container`.

### Task 4: Documentation and close

**Files:**

- Modify: `docs/deploy.md` (a "Container hardening" paragraph after "What protects the site"), `CLAUDE.md` ("Current status & next steps", refreshing the outdated text: WP1 and WP2 done, backups Branches 1 and 2 merged, WP3 done)

- [ ] **Step 1:** Write the deploy paragraph: what is limited and the measured numbers, how to raise a limit (edit the three keys, then `up -d`), that `/tmp` is the only other writable path, that the local stack listens on loopback only, and that the test stack picks the hardening up when recreated.
- [ ] **Step 2:** Update `CLAUDE.md` status and run `pnpm verify`. Expected: green.
- [ ] **Step 3:** `branch-reviewer` on the whole branch; fix findings; tell the owner before pushing; open the PR into `develop` (body: decisions, the measured numbers, what the smoke run showed, the note that the test stack inherits the hardening on its next recreate); `ci-watcher`. After the owner's merge: update the handoff table (package 3 done) and remove the worktree.

---

## Self-review

- **Spec coverage:** decisions 1, 2, 3, 4 and 5 are in Tasks 2 and 3; 6 (env_file stays) is a Global Constraint and untouched; 7 in Task 2; 8 (test stack not edited, inherits) in Task 1's assertions and the PR body; 9 in Task 1; 10 in Task 3. Efficiency rows: the measured numbers (Task 3), log and `tmpfs` bounds (Task 2, `docker inspect` in Task 3). Documentation section in Task 4.
- **Types and names:** the script's arguments and defaults are defined once (Task 1) and used by Task 2's runs; the project name `cocktail-hardening-check` is the same in the Global Constraints and Task 3.
- **Proportion:** four tasks, one branch; the plan is shorter than the spec's decision list plus tests and contains complete YAML only where the spec fixes exact values.
