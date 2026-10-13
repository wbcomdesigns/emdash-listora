#!/usr/bin/env bash
set -euo pipefail

BASE="${LISTORA_BASE:-http://localhost:4321}"
DROP="${1:-all}"
if [[ "${1:-}" == "--drop" ]]; then
	DROP="${2:-all}"
fi

fail() {
	echo "FAIL: $1" >&2
	exit 1
}

ok() {
	echo "PASS: $1"
}

json() {
	curl -sf -H "X-EmDash-Request: 1" -H "Origin: $BASE" "$@"
}

need() {
	local url="$1"
	local needle="$2"
	local label="$3"
	local tmp
	tmp="$(mktemp)"
	if ! curl -sf "$url" -o "$tmp"; then
		rm -f "$tmp"
		fail "$label ($url empty or error)"
	fi
	if ! grep -a -q "$needle" "$tmp"; then
		rm -f "$tmp"
		fail "$label (missing $needle)"
	fi
	rm -f "$tmp"
	ok "$label"
}

echo "Proving Listora lab at $BASE (drop=$DROP)"

health="$(json "$BASE/_emdash/api/plugins/listora/health")"
echo "$health" | grep -q '"ok":true' || fail "health ok"
echo "$health" | grep -q '"listingsCollection":true' || fail "listings collection"
ok "health"

need "$BASE/listings/" "The Golden Fork" "archive has Golden Fork"
need "$BASE/listings/" "listora-card" "archive uses Listora cards"
need "$BASE/listings/the-golden-fork/" "Handmade pasta" "detail Golden Fork"
need "$BASE/listings/the-golden-fork/" "application/ld+json" "detail JSON-LD"
need "$BASE/listings/submit/" "wizard-steps" "submit wizard"
need "$BASE/listings/calendar/" "Harbor Jazz Night" "calendar event"
need "$BASE/account/" "Dashboard" "owner dashboard"

search="$(json "$BASE/_emdash/api/plugins/listora/search?q=fork")"
echo "$search" | grep -q "Golden Fork" || fail "search fork"
ok "search"

types="$(json "$BASE/_emdash/api/plugins/listora/types")"
echo "$types" | grep -q "restaurant" || fail "types"
ok "types"

reviews="$(json "$BASE/_emdash/api/plugins/listora/reviews?listingId=listing-golden-fork")"
echo "$reviews" | grep -q "Handmade pasta" || fail "reviews"
ok "reviews"

dash="$(json "$BASE/_emdash/api/plugins/listora/dashboard?member_id=demo-member")"
echo "$dash" | grep -q '"favorites"' || fail "dashboard"
ok "dashboard"

export_json="$(json "$BASE/_emdash/api/plugins/listora/import?format=json")"
echo "$export_json" | grep -q '"count"' || fail "export json"
ok "export json"

geo="$(json "$BASE/_emdash/api/plugins/listora/import?format=geojson")"
echo "$geo" | grep -q "FeatureCollection" || fail "geojson"
ok "geojson"

dup="$(json "$BASE/_emdash/api/plugins/listora/duplicate?title=The%20Golden%20Fork")"
echo "$dup" | grep -q "the-golden-fork" || fail "duplicate"
ok "duplicate"

spam="$(curl -sf -X POST "$BASE/_emdash/api/plugins/listora/submit" \
	-H "Content-Type: application/json" \
	-H "X-EmDash-Request: 1" \
	-H "Origin: $BASE" \
	-d '{"title":"Test","company_website":"https://spam.example"}' || true)"
echo "$spam" | grep -q "VALIDATION_ERROR\|Submission rejected\|ok.:false" || fail "honeypot"
ok "honeypot"

echo "All requested checks passed for drop=$DROP"
