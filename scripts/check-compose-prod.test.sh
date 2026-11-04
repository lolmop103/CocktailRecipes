#!/usr/bin/env bash
# Test for check-compose-prod.sh: passes on the real files, fails on every weakened copy.
set -u
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 2
guard=scripts/check-compose-prod.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failed=0

note() { printf '%s: %s\n' "$1" "$2"; }

if [ -f "$guard" ] && bash "$guard" > "$tmp/real.out" 2>&1; then
  note PASS "guard passes on the real files"
else
  note FAIL "guard passes on the real files"
  sed 's/^/    /' "$tmp/real.out" 2> /dev/null
  failed=1
fi

# One case per rule: copy the real files, weaken one rule, expect the guard to
# exit 1 with a line "FAIL: <rule>". The edit is a JS snippet over the compose
# text `t`; dropKey removes a service key with its indented block.
run_case() {
  local rule=$1 edit=$2 dir=$tmp/$1
  mkdir -p "$dir"
  cp compose.prod.yaml "$dir/compose.prod.yaml"
  cp Dockerfile "$dir/Dockerfile"
  node -e '
const fs = require("fs");
const p = process.argv[1];
let t = fs.readFileSync(p, "utf8");
const dropKey = (k) => {
  const lines = t.split("\n");
  const i = lines.findIndex((l) => l.startsWith("    " + k + ":"));
  if (i < 0) return;
  let j = i + 1;
  while (j < lines.length && (lines[j].startsWith("      ") || lines[j].trim() === "")) j++;
  lines.splice(i, j - i);
  t = lines.join("\n");
};
const addKey = (txt) => { t = t.replace(/^    restart:/m, txt + "    restart:"); };
'"$edit"'
fs.writeFileSync(p, t);
' "$dir/compose.prod.yaml" || { note FAIL "$rule (edit script failed)"; failed=1; return; }
  if [ "$rule" = chown ]; then printf '\nRUN chown -R node:node /app\n' >> "$dir/Dockerfile"; fi
  if [ ! -f "$guard" ]; then note FAIL "weakened: $rule (guard missing)"; failed=1; return; fi
  local want=$rule
  [ "$rule" = chown ] && want=dockerfile
  bash "$guard" "$dir/compose.prod.yaml" docker-compose-test.yml "$dir/Dockerfile" > "$dir/out" 2>&1
  local code=$?
  if [ "$code" -eq 1 ] && grep -q "^FAIL: $want" "$dir/out"; then
    note PASS "weakened: $rule"
  else
    note FAIL "weakened: $rule (exit $code, wanted FAIL: $want)"
    sed 's/^/    /' "$dir/out"
    failed=1
  fi
}

run_case no-new-privileges 't = t.replace(/^\s*- no-new-privileges.*\n/m, ""); dropKey("security_opt");'
run_case cap_drop 'dropKey("cap_drop");'
run_case read_only 'dropKey("read_only");'
run_case mem_limit 'dropKey("mem_limit");'
run_case memswap_limit 'dropKey("memswap_limit");'
run_case cpus 'dropKey("cpus");'
run_case pids_limit 'dropKey("pids_limit");'
run_case tmpfs 'dropKey("tmpfs");'
run_case logging 'dropKey("logging");'
run_case init 'dropKey("init");'
run_case ports 'addKey("    ports:\n      - \"3000:3000\"\n");'
run_case cap_add 'addKey("    cap_add:\n      - NET_ADMIN\n");'
run_case trust-proxy-hops 't = t.replace(/\$\{TRUST_PROXY_HOPS:\?[^}]*\}/, "${TRUST_PROXY_HOPS:-1}");'
run_case chown ''

if [ "$failed" -ne 0 ]; then
  echo "check-compose-prod.test.sh: FAILED"
  exit 1
fi
echo "check-compose-prod.test.sh: all cases passed"
