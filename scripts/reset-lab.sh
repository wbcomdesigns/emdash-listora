#!/usr/bin/env bash
set -euo pipefail

PLUGIN="${LISTORA_PLUGIN:-$HOME/code/emdash-listora}"
LAB="${LISTORA_LAB:-$HOME/code/emdash-local}"

cd "$PLUGIN"
node scripts/merge-seed.mjs
npm test
npm run build

cd "$LAB"
npx astro dev stop || true
rm -f data/emdash.db data/emdash.db-wal data/emdash.db-shm
mkdir -p data
npx astro dev start --host 127.0.0.1 --port 4321 >/tmp/listora-lab.log 2>&1 &
for _ in $(seq 1 40); do
	if curl -sf http://127.0.0.1:4321/_emdash/api/plugins/listora/health >/dev/null; then
		curl -sf "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin" >/dev/null
		echo "Lab is up and seeded"
		exit 0
	fi
	sleep 1
done
echo "Lab did not become healthy. Tail:" >&2
tail -n 40 /tmp/listora-lab.log >&2
exit 1
