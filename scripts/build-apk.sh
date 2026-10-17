#!/usr/bin/env bash
set -euo pipefail
JAZZY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JAZZY_TOOLS="${JAZZY_TOOLS:-$JAZZY_ROOT/.tools}"
JAZZY_BUILD="$JAZZY_ROOT/build/manual"
JAZZY_SIGNING="${JAZZY_SIGNING:-$JAZZY_ROOT/../jazzy-signing}"
JAZZY_PLATFORM="$JAZZY_TOOLS/platforms/android-35/android.jar"
JAZZY_BUILD_TOOLS="$JAZZY_TOOLS/build-tools/35.0.0"
test -f "$JAZZY_PLATFORM" || { echo 'Run python3 scripts/setup-tools.py first.'; exit 1; }
mkdir -p "$JAZZY_BUILD/classes" "$JAZZY_BUILD/generated" "$JAZZY_BUILD/dex" "$JAZZY_ROOT/deliverables" "$JAZZY_SIGNING"
chmod 700 "$JAZZY_SIGNING"
"$JAZZY_BUILD_TOOLS/aapt2" compile --dir "$JAZZY_ROOT/app/src/main/res" -o "$JAZZY_BUILD/compiled.zip"
"$JAZZY_BUILD_TOOLS/aapt2" link -I "$JAZZY_PLATFORM" --manifest "$JAZZY_ROOT/app/src/main/AndroidManifest.xml" --java "$JAZZY_BUILD/generated" -A "$JAZZY_ROOT/app/src/main/assets" --min-sdk-version 26 --target-sdk-version 35 --version-code 3 --version-name 1.1.1 -o "$JAZZY_BUILD/resources.apk" "$JAZZY_BUILD/compiled.zip"
python3 "$JAZZY_ROOT/scripts/compile.py" "$JAZZY_ROOT" "$JAZZY_TOOLS" "$JAZZY_BUILD"
python3 - "$JAZZY_BUILD" <<'PY'
from pathlib import Path
import shutil,sys,zipfile
build=Path(sys.argv[1])
shutil.copyfile(build/'resources.apk',build/'unsigned.apk')
with zipfile.ZipFile(build/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as apk:
    for path in (build/'dex').glob('*.dex'):
        apk.write(path,path.name)
PY
"$JAZZY_BUILD_TOOLS/zipalign" -f 4 "$JAZZY_BUILD/unsigned.apk" "$JAZZY_BUILD/aligned.apk"
if [ ! -f "$JAZZY_SIGNING/release.p12" ]; then
    python3 - "$JAZZY_SIGNING" <<'PY'
import os,secrets,sys
from pathlib import Path
p=Path(sys.argv[1])/'password.txt'
p.write_text(secrets.token_urlsafe(40))
os.chmod(p,0o600)
PY
    export JAZZY_STORE_PASS
    JAZZY_STORE_PASS="$(cat "$JAZZY_SIGNING/password.txt")"
    keytool -genkeypair -keystore "$JAZZY_SIGNING/release.p12" -storetype PKCS12 -storepass:env JAZZY_STORE_PASS -keypass:env JAZZY_STORE_PASS -alias jazzy -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=JAZZY Personal App, OU=Private Android, O=JAZZY' -noprompt
fi
export JAZZY_STORE_PASS
JAZZY_STORE_PASS="$(cat "$JAZZY_SIGNING/password.txt")"
java -jar "$JAZZY_BUILD_TOOLS/lib/apksigner.jar" sign --ks "$JAZZY_SIGNING/release.p12" --ks-key-alias jazzy --ks-pass env:JAZZY_STORE_PASS --key-pass env:JAZZY_STORE_PASS --out "$JAZZY_ROOT/deliverables/JAZZY-1.1.1.apk" "$JAZZY_BUILD/aligned.apk"
unset JAZZY_STORE_PASS
java -jar "$JAZZY_BUILD_TOOLS/lib/apksigner.jar" verify --verbose --print-certs "$JAZZY_ROOT/deliverables/JAZZY-1.1.1.apk"
"$JAZZY_BUILD_TOOLS/zipalign" -c 4 "$JAZZY_ROOT/deliverables/JAZZY-1.1.1.apk"
echo "APK ready: $JAZZY_ROOT/deliverables/JAZZY-1.1.1.apk"
