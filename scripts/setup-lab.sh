#!/usr/bin/env bash
set -euo pipefail

PLUGIN="${LISTORA_PLUGIN:-$(cd "$(dirname "$0")/.." && pwd)}"
LAB="${LISTORA_LAB:-$(cd "$PLUGIN/.." && pwd)/emdash-local}"

export LISTORA_PLUGIN="$PLUGIN"
export LISTORA_LAB="$LAB"

need_node() {
	node -e '
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 16)) {
  console.error("Node.js 22.16 or later is required. Found " + process.version);
  process.exit(1);
}
'
}

echo "Plugin: $PLUGIN"
echo "Lab:    $LAB"
need_node

cd "$PLUGIN"
npm install --legacy-peer-deps

if [[ ! -f "$LAB/astro.config.mjs" && ! -f "$LAB/astro.config.ts" && ! -f "$LAB/astro.config.js" ]]; then
	if [[ -e "$LAB" ]]; then
		echo "$LAB exists but is not an EmDash site (no astro.config)." >&2
		exit 1
	fi
	parent="$(dirname "$LAB")"
	name="$(basename "$LAB")"
	mkdir -p "$parent"
	echo "Creating EmDash Node starter at $LAB"
	(cd "$parent" && npm create emdash@latest -- "$name" --template starter --platform node --pm npm --yes)
fi

node "$PLUGIN/scripts/wire-lab.mjs"
"$PLUGIN/scripts/apply-kit.sh"
node "$PLUGIN/scripts/merge-seed.mjs"

cd "$LAB"
npm install --legacy-peer-deps

echo
echo "Lab is wired. First run (wipes the site DB so seed listings land):"
echo "  $PLUGIN/scripts/reset-lab.sh"
echo "  $PLUGIN/scripts/prove-lab.sh --all"
echo
echo "Then open http://localhost:4321/listings/"
echo "Admin bypass: http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin"
