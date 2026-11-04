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

# One case per rule: copy the real files, weaken one, expect the guard to exit 1
# with a line "FAIL: <want>". The edit is a JS snippet over the text `t` of the
# file named by <target> (prod = compose.prod.yaml, test = docker-compose-test.yml,
# docker = Dockerfile). dropKey removes a service key with its indented block,
# addKey inserts service keys before `restart:`, addAfter inserts after a line.
# The case fails if the edit changed nothing.
run_case() {
  local name=$1 want=$2 target=$3 edit=$4 dir=$tmp/$1
  mkdir -p "$dir"
  cp compose.prod.yaml "$dir/compose.prod.yaml"
  cp docker-compose-test.yml "$dir/docker-compose-test.yml"
  cp Dockerfile "$dir/Dockerfile"
  local file
  case $target in
    prod) file=compose.prod.yaml ;;
    test) file=docker-compose-test.yml ;;
    docker) file=Dockerfile ;;
  esac
  node -e '
const fs = require("fs");
const p = process.argv[1];
let t = fs.readFileSync(p, "utf8");
const before = t;
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
if (t === before) { console.error("edit changed nothing"); process.exit(3); }
fs.writeFileSync(p, t);
' "$dir/$file" 2> "$dir/edit.err"
  local ec=$?
  if [ "$ec" -eq 3 ]; then
    # Red state: the key is already absent in the real file, so the copy equals it.
    note NOTE "weakened: $name: edit changed nothing (key already absent)"
  elif [ "$ec" -ne 0 ]; then
    note FAIL "weakened: $name (edit script failed)"
    failed=1
    return
  fi
  if [ ! -f "$guard" ]; then note FAIL "weakened: $name (guard missing)"; failed=1; return; fi
  bash "$guard" "$dir/compose.prod.yaml" "$dir/docker-compose-test.yml" "$dir/Dockerfile" > "$dir/out" 2>&1
  local code=$?
  if [ "$code" -eq 1 ] && grep -q "^FAIL: $want" "$dir/out"; then
    note PASS "weakened: $name"
  else
    note FAIL "weakened: $name (exit $code, wanted FAIL: $want)"
    sed 's/^/    /' "$dir/out"
    failed=1
  fi
}

run_case no-new-privileges no-new-privileges prod 't = t.replace(/^\s*- no-new-privileges.*\n/m, ""); dropKey("security_opt");'
run_case cap_drop cap_drop prod 'dropKey("cap_drop");'
run_case read_only read_only prod 'dropKey("read_only");'
run_case mem_limit mem_limit prod 'dropKey("mem_limit");'
run_case memswap_limit memswap_limit prod 'dropKey("memswap_limit");'
run_case memswap-differs memswap_limit prod 't = t.replace(/^    memswap_limit:.*$/m, "    memswap_limit: 4096m");'
run_case cpus cpus prod 'dropKey("cpus");'
run_case pids_limit pids_limit prod 'dropKey("pids_limit");'
run_case tmpfs tmpfs prod 'dropKey("tmpfs");'
run_case tmpfs-exec tmpfs prod 't = t.replace(/,noexec/, "");'
run_case tmpfs-suid tmpfs prod 't = t.replace(/,nosuid/, "");'
run_case logging logging prod 'dropKey("logging");'
run_case logging-size logging prod 't = t.replace(/max-size: \S+/, "max-size: 100m");'
run_case logging-file logging prod 't = t.replace(/^\s*max-file:.*\n/m, "");'
run_case init init prod 'dropKey("init");'
run_case ports ports prod 'addKey("    ports:\n      - \"3000:3000\"\n");'
run_case cap_add cap_add prod 'addKey("    cap_add:\n      - NET_ADMIN\n");'
run_case privileged privileged prod 'addKey("    privileged: true\n");'
run_case user-root user prod 'addKey("    user: root\n");'
run_case user-zero user prod 'addKey("    user: \"0:0\"\n");'
run_case security-opt-extra security_opt prod 't = t.replace(/^(\s*)- no-new-privileges:true\n/m, "$&$1- seccomp:unconfined\n");'
run_case pid-host pid prod 'addKey("    pid: host\n");'
run_case network-host network_mode prod 'dropKey("networks"); addKey("    network_mode: host\n");'
run_case ipc-host ipc prod 'addKey("    ipc: host\n");'
run_case userns-host userns_mode prod 'addKey("    userns_mode: host\n");'
run_case mounts-bind mounts prod 't = t.replace(/^(\s*)- cocktail-db:\/data\n/m, "$&$1- \/var\/run\/docker.sock:\/var\/run\/docker.sock:ro\n");'
run_case mounts-writable mounts prod 't = t.replace(/^(\s*)- cocktail-db:\/data\n/m, "$&$1- \/var\/lib\/extra\n");'
run_case trust-proxy-hops trust-proxy-hops prod 't = t.replace(/\$\{TRUST_PROXY_HOPS:\?[^}]*\}/, "${TRUST_PROXY_HOPS:-1}");'
run_case test-stack-read-only test-stack test 't = t.replace(/^    env_file: !reset \[\]\n/m, "$&    read_only: false\n");'
run_case test-stack-cap-drop test-stack test 't = t.replace(/^    env_file: !reset \[\]\n/m, "$&    cap_drop: !override [NET_RAW]\n");'
run_case chown dockerfile docker 't += "\nRUN chown -R node:node /app\n";'
run_case chown-slash dockerfile docker 't += "\nRUN chown -R node:node /app/\n";'
run_case chown-dot dockerfile docker 't += "\nRUN chown -R node:node .\n";'
run_case chown-lowercase-stage dockerfile docker 't = t.replace("AS runner", "as runner") + "\nRUN chown -R node:node /app\n";'
run_case copy-chown dockerfile docker 't += "\nCOPY --chown=node:node --from=builder /app/server/dist /app/server/dist\n";'
run_case runner-renamed dockerfile docker 't = t.replace("AS runner", "AS runtime");'

# A crashing assertion step must count as a failure: a docker shim returns invalid JSON.
shim=$tmp/shim
mkdir -p "$shim"
printf '#!/bin/sh\necho "{not json"\n' > "$shim/docker"
chmod +x "$shim/docker"
PATH="$shim:$PATH" bash "$guard" > "$tmp/crash.out" 2>&1
code=$?
if [ "$code" -eq 1 ] && grep -q "^FAIL: internal" "$tmp/crash.out"; then
  note PASS "node crash counts as a failure"
else
  note FAIL "node crash counts as a failure (exit $code)"
  sed 's/^/    /' "$tmp/crash.out"
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "check-compose-prod.test.sh: FAILED"
  exit 1
fi
echo "check-compose-prod.test.sh: all cases passed"
