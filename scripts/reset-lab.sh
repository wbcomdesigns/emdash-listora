#!/usr/bin/env bash
set -euo pipefail

PLUGIN="${LISTORA_PLUGIN:-$(cd "$(dirname "$0")/.." && pwd)}"
LAB="${LISTORA_LAB:-$(cd "$PLUGIN/.." && pwd)/emdash-local}"

PORT="${LISTORA_PORT:-4321}"

export LISTORA_PLUGIN="$PLUGIN"
export LISTORA_LAB="$LAB"

if [[ ! -f "$LAB/package.json" ]]; then
	echo "Lab site not found at $LAB. Run scripts/setup-lab.sh first." >&2
	exit 1
fi

cd "$PLUGIN"
node scripts/merge-seed.mjs
npm test
npm run build

wipe_sqlite() {
	local file="$1"
	rm -f "$file" "${file}-wal" "${file}-shm"
}

wipe_sqlite "$LAB/data/emdash.db"
wipe_sqlite "$LAB/data.db"
if [[ -f "$LAB/astro.config.mjs" || -f "$LAB/astro.config.ts" || -f "$LAB/astro.config.js" ]]; then
	config="$(cat "$LAB"/astro.config.mjs "$LAB"/astro.config.ts "$LAB"/astro.config.js 2>/dev/null || true)"
	db="$(printf '%s\n' "$config" | sed -n 's/.*url:[[:space:]]*"file:\([^"]*\)".*/\1/p' | head -n 1)"
	if [[ -n "${db:-}" ]]; then
		if [[ "$db" == ./* ]]; then
			wipe_sqlite "$LAB/${db#./}"
		else
			wipe_sqlite "$db"
		fi
	fi
fi

cd "$LAB"
npx astro dev stop || true
mkdir -p data
npx astro dev start --host 127.0.0.1 --port "$PORT" >/tmp/listora-lab.log 2>&1 &
for _ in $(seq 1 40); do
	if curl -sf http://127.0.0.1:$PORT/_emdash/api/plugins/listora/health >/dev/null; then
		# health is read only, so the demo storage (reviews, a claim, two waiting listings) is
		# loaded the way an owner does it: Get started, Load sample directory, as the lab admin.
		jar="$(mktemp)"
		curl -sf -c "$jar" "http://127.0.0.1:$PORT/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin" >/dev/null
		curl -sf -b "$jar" -H "X-EmDash-Request: 1" -H "Origin: http://127.0.0.1:$PORT" -H "Content-Type: application/json" \
			-d '{"type":"block_action","action_id":"load_sample","page":"/setup"}' \
			"http://127.0.0.1:$PORT/_emdash/api/plugins/listora/admin" >/dev/null || { echo "Could not load the sample directory" >&2; rm -f "$jar"; exit 1; }
		rm -f "$jar"
		echo "Lab is up and seeded"
		exit 0
	fi
	sleep 1
done
echo "Lab did not become healthy. Tail:" >&2
tail -n 40 /tmp/listora-lab.log >&2
exit 1
