> For version 1.1 results and limitations, see [UPDATE-1.1.md](UPDATE-1.1.md). The historical browser checks below apply to version 1.0 only.

# Verification status

Verified 2026-10-17.

## Completed

- **Android APK built and signed:** `JAZZY-1.0.apk`, package `app.jazzy`, Android 8.0+ (minimum API 26), target API 35, version 1.0. Release manifest has debugging disabled.
- **APK checks:** v2 and v3 signature verification passed, ZIP alignment passed, archive integrity passed, Android manifest/permissions checked, native DEX bytecode present. Password seed data is not included in the APK.
- **13 Node tests passed:** encryption round trips; ciphertext/metadata tamper rejection; unique nonces; invite separation; URL validation; two-account pairing and authorization; idempotent retries and pagination; invite expiry, CORS and storage quota; confirmed erasure; story expiry, authorship and likes; media/file validation; password login, name/username/password changes, session rotation/expiry, and logout.
- **Browser integration passed:** independent browser contexts logged in and paired, exchanged encrypted text and photos, liked/commented, shared Reel links, restored encrypted history after reload, sent and saved generic file attachments, changed name/username/password, rejected the old password, and logged in with the new password while preserving history. Request inspection found no pair key or plaintext chat sent to the relay.
- **Visual checks:** light-blue welcome/login/feed/chat/profile previews captured and inspected. No horizontal overflow in the profile at 320/390/500px.

## Verification limits

- Physical Android phones/emulators were not available. Native document selection/saving, Android Keystore persistence, lifecycle/keyboard behavior, and Android share intents need verification on the actual phones.
- Browser tests simulate the native bridge and exercise the real encryption code and SQLite relay handler. They do not replace native-device testing.
- The server has not been deployed. Docker/Caddy/HTTPS operation must be checked on the user's host following SETUP.md.
- Encryption has not been independently audited and has no forward secrecy. See SECURITY.md.
