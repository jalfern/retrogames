#!/bin/zsh
# testflight.sh — archive native ports and upload them to TestFlight (#2443).
#
#   native/testflight.sh joust [emberwood gauntlet]   # upload these ports (iOS + tvOS)
#   native/testflight.sh all                          # all three
#   native/testflight.sh --changed                    # ports whose native/<port> or native/RetroKit
#                                                     # changed on origin/main since the last upload
#   PLATFORMS="iOS" native/testflight.sh joust        # one platform only
#   DRY=1 ...                                         # archive + export locally, no upload
#
# Runs on studio only. The archive signs for development with the App Store Connect API key
# (App Manager; key file passed by path only). Export + upload use the Apple ID signed in to
# Xcode > Settings > Accounts: that key may not use cloud distribution signing, Xcode's
# account (Jon, account holder) may.
# Build number = the built commit's UTC commit time, YYYYMMDD.HHMM: from git, unique per
# commit, and rising with every merge to main (a commit count would repeat across branches
# and squash-merges). The version stays MARKETING_VERSION from the project.
# Each port must already have an App Store Connect app record (Apple's API can't create
# one): Joust, Emberwood, Gauntlet under com.jalfern.retrogames.<port>.
set -euo pipefail

KEY_ID=9G2GAR96DP
ISSUER=69a6de76-a285-47e3-e053-5b8c7c11a4d1
KEY_PATH=$HOME/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8
TEAM=LD5J9B949R
NATIVE=${0:A:h}
REPO=${NATIVE:h}
OUT=${TESTFLIGHT_OUT:-$HOME/Library/Developer/retrogames-testflight}
STAMP=$OUT/last-uploaded            # origin/main sha the --changed mode last shipped
PLATFORMS=(${=PLATFORMS:-iOS tvOS})
typeset -A SCHEME=(joust Joust emberwood Emberwood gauntlet Gauntlet)
ALL=(joust emberwood gauntlet)

[[ -f $KEY_PATH ]] || { echo "missing API key file $KEY_PATH" >&2; exit 2; }
mkdir -p $OUT

ports=()
src=$REPO
if [[ ${1:-} == --changed ]]; then
  # Build from a clean detached checkout of origin/main, never the caller's tree.
  git -C $REPO fetch -q origin main
  head=$(git -C $REPO rev-parse origin/main)
  last=$(cat $STAMP 2>/dev/null || true)
  [[ $head == $last ]] && { echo "origin/main $head already uploaded"; exit 0; }
  src=$OUT/src
  if [[ ! -d $src ]]; then git -C $REPO worktree add -q --detach $src $head
  else git -C $src checkout -q --detach $head; fi
  for p in $ALL; do
    if [[ -z $last ]] || ! git -C $REPO diff --quiet $last $head -- native/$p-claude native/RetroKit; then
      ports+=$p
    fi
  done
  (( ${#ports} )) || { echo $head > $STAMP; echo "no native changes since ${last:0:9}"; exit 0; }
elif [[ ${1:-} == all ]]; then
  ports=($ALL)
else
  ports=($@)
fi
(( ${#ports} )) || { sed -n '2,11p' $0; exit 2; }

build=$(TZ=UTC git -C $src log -1 --format=%cd --date=format-local:%Y%m%d.%H%M)
sha=$(git -C $src rev-parse --short HEAD)
auth=(-allowProvisioningUpdates -authenticationKeyPath $KEY_PATH
      -authenticationKeyID $KEY_ID -authenticationKeyIssuerID $ISSUER)

dest=upload; [[ -n ${DRY:-} ]] && dest=export
opts=$OUT/ExportOptions.plist
cat > $opts <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$dest</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict></plist>
EOF

fail=0
for p in $ports; do
  s=${SCHEME[$p]:-}; [[ -n $s ]] || { echo "unknown port $p" >&2; exit 2; }
  for plat in $PLATFORMS; do
    tag=$p-$plat-$build
    arch=$OUT/$tag.xcarchive
    log=$OUT/$tag.log
    echo "== $p $plat build $build ($sha) → $log"
    rm -rf $arch $OUT/$tag-export
    if xcodebuild archive -project $src/native/$p-claude/$s.xcodeproj -scheme $s \
         -configuration Release -destination "generic/platform=$plat" -archivePath $arch \
         CURRENT_PROJECT_VERSION=$build $auth >$log 2>&1 \
       && xcodebuild -exportArchive -archivePath $arch -exportOptionsPlist $opts \
         -exportPath $OUT/$tag-export -allowProvisioningUpdates >>$log 2>&1; then
      echo "   ok${DRY:+ (dry run, not uploaded)}"
    else
      fail=1; echo "   FAILED:"; grep -E 'error|Error' $log | tail -8
    fi
  done
done

if [[ ${1:-} == --changed && $fail == 0 && -z ${DRY:-} ]]; then echo $head > $STAMP; fi
exit $fail
