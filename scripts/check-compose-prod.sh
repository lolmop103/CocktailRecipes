#!/usr/bin/env bash
# Guard for the hardened production compose file (docs/superpowers/specs/
# 2026-11-04-compose-hardening-design.md, decision 9).
# Usage: check-compose-prod.sh [compose-file] [test-compose-file] [dockerfile]
# Prints one "FAIL: <rule>: <detail>" line per violation and exits 1; else "OK".
set -u

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 2
compose=${1:-compose.prod.yaml}
testcompose=${2:-docker-compose-test.yml}
dockerfile=${3:-Dockerfile}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/empty.env"
envfile=$tmp/empty.env
if command -v cygpath > /dev/null 2>&1; then envfile=$(cygpath -m "$envfile"); fi

fails=0
fail() { printf 'FAIL: %s\n' "$1"; fails=$((fails + 1)); }

# Render with an empty env file so a repository .env cannot hide a :? guard.
render() { # file, then env assignments
  local f=$1
  shift
  env -u TRUST_PROXY_HOPS COCKTAIL_ENV_FILE="$envfile" ADMIN_USERNAME=ci ADMIN_PASSWORD_HASH=ci "$@" \
    docker compose --env-file "$envfile" -f "$f" config --format json 2> "$tmp/err"
}

if ! render "$compose" TRUST_PROXY_HOPS=1 > "$tmp/prod.json"; then
  fail "render: $compose does not render: $(head -c 300 "$tmp/err" | tr '\n' ' ')"
else
  node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const s = (cfg.services || {}).cocktail;
const out = [];
const f = (rule, detail) => out.push(`${rule}: ${detail}`);
if (!s) { f("service", "cocktail missing"); }
else {
  if (!(s.security_opt || []).some((o) => /^no-new-privileges(:|=)true$/.test(o))) f("no-new-privileges", "security_opt lacks no-new-privileges:true");
  if (!((s.cap_drop || []).length === 1 && String(s.cap_drop[0]).toUpperCase() === "ALL")) f("cap_drop", "must be [ALL]");
  if (s.cap_add && s.cap_add.length) f("cap_add", "must be absent");
  if (s.read_only !== true) f("read_only", "must be true");
  const bytes = (v) => {
    if (v === undefined || v === null || v === "") return NaN;
    if (typeof v === "number") return v;
    const m = /^(\d+(?:\.\d+)?)\s*([bkmg]?)b?$/i.exec(String(v).trim());
    if (!m) return NaN;
    return Math.round(Number(m[1]) * ({ "": 1, b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 })[m[2].toLowerCase()]);
  };
  const mem = bytes(s.mem_limit), swap = bytes(s.memswap_limit);
  if (!(mem > 0)) f("mem_limit", "not set");
  if (!(swap > 0)) f("memswap_limit", "not set");
  else if (mem > 0 && mem !== swap) f("memswap_limit", `must equal mem_limit (${mem} vs ${swap})`);
  if (!(Number(s.cpus) > 0)) f("cpus", "not set");
  if (!(Number(s.pids_limit) > 0)) f("pids_limit", "not set");
  const opts = (s.logging && s.logging.options) || {};
  if (!s.logging || !opts["max-size"] || !opts["max-file"]) f("logging", "log rotation (max-size and max-file) not set");
  if (s.init !== true) f("init", "must be true");
  if (s.ports && s.ports.length) f("ports", "no published ports allowed");
  // Writable mounts: only the /data volume and a /tmp tmpfs.
  const vols = s.volumes || [];
  const data = vols.filter((v) => v.target === "/data");
  if (data.length !== 1 || data[0].type !== "volume") f("mounts", "/data must be a named volume");
  const tmpfs = [];
  for (const t of Array.isArray(s.tmpfs) ? s.tmpfs : s.tmpfs ? [s.tmpfs] : []) tmpfs.push(String(t).split(":")[0]);
  for (const v of vols) if (v.type === "tmpfs") tmpfs.push(v.target);
  if (tmpfs.length !== 1 || tmpfs[0] !== "/tmp") f("tmpfs", `must be exactly /tmp (found: ${tmpfs.join(",") || "none"})`);
  for (const v of vols) {
    if (v.target === "/data" || (v.type === "tmpfs" && v.target === "/tmp")) continue;
    if (v.read_only !== true) f("mounts", `unexpected writable mount ${v.target}`);
  }
}
for (const l of out) console.log("FAIL: " + l);
process.exit(out.length ? 1 : 0);
' "$tmp/prod.json" > "$tmp/res" 2> "$tmp/nodeerr"
  rc=$?
  cat "$tmp/res"
  nf=$(grep -c "^FAIL: " "$tmp/res")
  fails=$((fails + nf))
  if [ "$rc" -ne 0 ] && [ "$nf" -eq 0 ]; then fail "internal: node assertion step crashed: $(head -c 200 "$tmp/nodeerr" | tr '\n' ' ')"; fi
fi

# TRUST_PROXY_HOPS must stay mandatory.
if render "$compose" > /dev/null; then
  fail "trust-proxy-hops: $compose renders without TRUST_PROXY_HOPS (the :? guard is gone)"
fi

# The test stack keeps the hardening it inherits.
if ! render "$testcompose" TRUST_PROXY_HOPS=1 > "$tmp/test.json"; then
  fail "test-stack: $testcompose does not render: $(head -c 300 "$tmp/err" | tr '\n' ' ')"
else
  node -e '
const cfg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const s = (cfg.services || {}).app;
if (!s) { console.log("FAIL: test-stack: service app missing"); process.exit(1); }
let bad = 0;
if (s.read_only !== true) { console.log("FAIL: test-stack: read_only must be true"); bad = 1; }
if (!(s.cap_drop || []).some((c) => String(c).toUpperCase() === "ALL")) { console.log("FAIL: test-stack: cap_drop must contain ALL"); bad = 1; }
process.exit(bad);
' "$tmp/test.json" > "$tmp/res" 2> "$tmp/nodeerr"
  rc=$?
  cat "$tmp/res"
  nf=$(grep -c "^FAIL: " "$tmp/res")
  fails=$((fails + nf))
  if [ "$rc" -ne 0 ] && [ "$nf" -eq 0 ]; then fail "internal: node assertion step crashed: $(head -c 200 "$tmp/nodeerr" | tr '\n' ' ')"; fi
fi

# Dockerfile: no recursive chown of /app in the runner stage.
if [ ! -f "$dockerfile" ]; then
  fail "dockerfile: $dockerfile not found"
elif awk '/^FROM .* AS runner/{r=1; next} /^FROM /{r=0} r' "$dockerfile" | grep -Eq 'chown[[:space:]]+(-[A-Za-z]*R|--recursive)[^#]*/app([[:space:]]|$)'; then
  fail "dockerfile: runner stage runs chown -R on /app"
fi

if [ "$fails" -gt 0 ]; then exit 1; fi
echo OK
