#!/bin/bash
# Forced command for the tc_review key: appends one validated review record, nothing else.
set -u
umask 002
R=/work/.reviews
fail() { echo "REJECTED: $1"; exit 2; }
in=$(head -c 65537; echo x); in=${in%x}
[ ${#in} -le 65536 ] || fail "record too large"
# exactly one JSON document, and it must be an object (a multi-document stream would only have its last value checked)
echo "$in" | jq -es 'length==1 and (.[0]|type=="object")' 2>/dev/null | grep -qx true || fail "input must be exactly one JSON object"
rec=$(echo "$in" | jq -c .) || fail "not JSON"
ID='^[A-Za-z0-9._-]{1,64}$'
echo "$rec" | jq -e --arg id "$ID" '
  (.round|type=="number" and floor==. and (.==1 or .==2)) and (.hash|type=="string" and test("^[0-9a-f]{64}$") and (contains("\n")|not)) and (.verdict|IN("approve","changes"))
  and (.reviewer|type=="string" and test($id) and (contains("\n")|not)) and (.implementers|type=="array" and length>=1 and all(type=="string" and test($id) and (contains("\n")|not)))
  and (.scope|type=="string" and length>0) and (.findings|type=="string")
  and ((.round==1 and (.round1==null)) or (.round==2 and (.round1|type=="string" and (contains("\n")|not))))' >/dev/null || fail "schema check failed"
round=$(echo "$rec" | jq -r '.round|floor|tostring'); hash=$(echo "$rec" | jq -r .hash); reviewer=$(echo "$rec" | jq -r .reviewer)
[[ $round =~ ^[12]$ && $hash =~ ^[0-9a-f]{64}$ && $reviewer =~ ^[A-Za-z0-9._-]{1,64}$ ]] || fail "field re-check failed"
echo "$rec" | jq -e --arg r "$reviewer" '.implementers|index($r)|not' >/dev/null || fail "reviewer is among implementers"
if [ "$round" = 2 ]; then
  r1=$(echo "$rec" | jq -r .round1)
  [[ $r1 =~ ^[0-9a-f]{64}/r1-[A-Za-z0-9._-]+$ ]] || fail "bad round1 reference"
  [ -f "$R/$r1.json" ] || fail "round1 record does not exist"
  jq -e '.round==1' "$R/$r1.json" >/dev/null || fail "round1 reference is not a round-1 record"
  jq -en --argjson a "$rec" --slurpfile b "$R/$r1.json" '$a.reviewer != $b[0].reviewer and (($a.implementers + $b[0].implementers)|index($b[0].reviewer))==null and (($a.implementers + $b[0].implementers)|index($a.reviewer))==null' >/dev/null \
    || fail "round-1 reviewer is an implementer, or both rounds have the same reviewer"
  jq -en --argjson a "$rec" --slurpfile b "$R/$r1.json" '$b[0].hash != $a.hash or $b[0].verdict=="approve"' >/dev/null \
    || fail "round-1 record for the same hash is not an approve"
fi
ts=$(date -u +%Y%m%dT%H%M%SZ)-$$
name="r$round-$ts-$reviewer"; id="$hash/$name"
mkdir -p "$R/$hash" || fail "store unavailable"
tmp=$(mktemp "$R/$hash/.part.XXXXXX") || fail "store unavailable"
echo "$rec" | jq --arg id "$id" --arg ts "$(date -u +%FT%TZ)" '{round,hash,verdict,reviewer,implementers,round1,scope,findings} + {id:$id,submitted:$ts}' > "$tmp"
ln "$tmp" "$R/$hash/$name.json" 2>/dev/null || { rm -f "$tmp"; fail "record exists (append-only)"; }
rm -f "$tmp"; chmod 444 "$R/$hash/$name.json"
echo "$id"
