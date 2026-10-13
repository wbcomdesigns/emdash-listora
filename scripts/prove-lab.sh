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

fork_id="$(echo "$search" | sed -n 's/.*"id":"\([^"]*\)","slug":"the-golden-fork".*/\1/p')"
[[ -n "$fork_id" ]] || fail "Golden Fork id from search"
reviews="$(json "$BASE/_emdash/api/plugins/listora/reviews?listingId=$fork_id")"
echo "$reviews" | grep -q "Handmade pasta" || fail "reviews"
ok "reviews"

# Member and admin routes refuse guests, then answer the signed-in dev admin.
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT
status() { curl -s -o /dev/null -w "%{http_code}" -H "X-EmDash-Request: 1" -H "Origin: $BASE" "$@"; }
for route in dashboard favorites privacy export; do
	[[ "$(status "$BASE/_emdash/api/plugins/listora/$route")" == "401" ]] || fail "guest refused on $route"
done
for route in import admin; do
	[[ "$(status -X POST -H "Content-Type: application/json" -d '{}' "$BASE/_emdash/api/plugins/listora/$route")" == "401" ]] || fail "guest refused on $route"
done
ok "guests refused on member and admin routes"

curl -sf -c "$JAR" -o /dev/null "$BASE/_emdash/api/setup/dev-bypass?redirect=/"
dash="$(json -b "$JAR" "$BASE/_emdash/api/plugins/listora/dashboard")"
echo "$dash" | grep -q '"favorites"' || fail "dashboard"
ok "dashboard (signed in)"

# Export is a real file: a spreadsheet sent as a download, with the column names first.
export_head="$(curl -s -D - -o /tmp/listora-export.csv -H "X-EmDash-Request: 1" -b "$JAR" "$BASE/_emdash/api/plugins/listora/export")"
echo "$export_head" | grep -qi "content-disposition: attachment; filename=\"listings-" || fail "export is a download"
echo "$export_head" | grep -qi "content-type: text/csv" || fail "export is a spreadsheet"
head -c 200 /tmp/listora-export.csv | grep -q "title,listing_type,city" || fail "export has the column names"
ok "export downloads a spreadsheet (admin)"

# A signed-in member who is not an admin is refused on every admin route.
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPTS/lab-role.sh" subscriber >/dev/null
member_export="$(status -H "X-EmDash-Request: 1" -b "$JAR" "$BASE/_emdash/api/plugins/listora/export")"
member_import="$(status -H "X-EmDash-Request: 1" -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"csv":"title\nX","mode":"import"}' "$BASE/_emdash/api/plugins/listora/import")"
member_admin="$(status -H "X-EmDash-Request: 1" -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"type":"page_load","page":"/queue"}' "$BASE/_emdash/api/plugins/listora/admin")"
"$SCRIPTS/lab-role.sh" admin >/dev/null
[[ "$member_export" == "403" && "$member_import" == "403" && "$member_admin" == "403" ]] || fail "member refused on admin routes (export $member_export, import $member_import, admin $member_admin)"
ok "members refused on admin routes"

dup="$(json "$BASE/_emdash/api/plugins/listora/duplicate?title=The%20Golden%20Fork")"
echo "$dup" | grep -q "the-golden-fork" || fail "duplicate"
ok "duplicate"

spam="$(json -b "$JAR" -X POST "$BASE/_emdash/api/plugins/listora/submit" \
	-H "Content-Type: application/json" \
	-d '{"title":"Test","company_website":"https://spam.example"}' || true)"
echo "$spam" | grep -q "Submission rejected" || fail "honeypot"
ok "honeypot"

echo "All requested checks passed for drop=$DROP"
