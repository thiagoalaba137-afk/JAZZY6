# Building the JAZZY APK

The source is a standard Android Java project with a bundled HTML/CSS/JavaScript interface. There are no runtime JavaScript dependencies, remote UI scripts, analytics libraries, or native third-party app libraries.

## Lightweight Linux build

Requirements: Linux x86-64, Java 17+ runtime with `java` and `keytool`, Python 3.10+, Bash, and Internet access for the initial tool downloads. Node 24+ is required for tests and the relay.

From the project directory:

```sh
python3 scripts/setup-tools.py
bash scripts/build-apk.sh
```

The setup script downloads Android platform 35 and build-tools 35.0.0 from Google's official SDK repository and Eclipse's ECJ 3.39.0 compiler from Maven Central. Downloads use the host's normal proxy/CA settings and are checked against upstream checksums. Only build tools are downloaded; app user data is not sent.

You can store tools separately:

```sh
python3 scripts/setup-tools.py /path/to/android-tools
JAZZY_TOOLS=/path/to/android-tools bash scripts/build-apk.sh
```

The build generates an Android 8+ APK targeting API 35, packages the bundled UI, creates a unique release signing key, signs the APK, and verifies its signature and ZIP alignment.

Expected output:

```text
deliverables/JAZZY-1.0.apk
```

The script keeps the signing key and its password in a private sibling directory `../jazzy-signing/`, outside the source archive. Back up that directory privately. **Future updates must use the same signing key** to install over the original app and retain its data. Never publish the signing directory, `.env` files, device credentials, or pair invites. Set `JAZZY_SIGNING` to use an existing signing-material directory.

The APK is built with `android:debuggable="false"`; it is not a universal Android Studio debug-key build. This does not imply a security audit or Play Store approval.

## Android Studio

Open the project root in Android Studio and install Android SDK 35. The Gradle project uses Android Gradle Plugin 8.7.3; a compatible Gradle 8.9 installation and Java 17+ are required. Android Studio can configure these components. Use **Build → Generate Signed App Bundle / APK → APK** and supply your signing key. The Gradle wrapper is not bundled; the lightweight script above is the automated command-line path.

For a Gradle release build, the APK must be signed through Android Studio or `apksigner`; do not distribute an unsigned `assembleRelease` artifact.

## Checks

Run the security/domain tests individually to see each assertion group:

```sh
node tests/crypto.test.mjs
node tests/relay.test.mjs
node tests/model.test.mjs
node tests/accounts.test.mjs
```

`npm test` also runs the suite. It needs no package installation.

The browser workflow test uses Playwright and an installed Chromium browser:

```sh
npm install --no-save playwright
CHROMIUM_PATH=/usr/bin/chromium node tests/ui.mjs
```

It uses in-process request interception and separate browser contexts to simulate two devices. It does not require hosting or send messages to an external service. Screenshots are clearly labeled preview UI and do not constitute a physical-device test.

Native release verification should include installation on both actual Android phones, document selection, Android share-to-JAZZY, app restart/key persistence, background/foreground sync, keyboard handling, and a real HTTPS deployment. These checks require devices and cannot be replaced by browser tests.
