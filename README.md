# JAZZY 1.1.1

Private Android sharing for the two existing accounts, hyusukk and JAZZY. Login opens Home; find the other username in Friends and accept the request. Messages and the pairing request are encrypted on the phones. There is no public signup.

## Deploy on your existing Render service

1. Connect the service to **thiagoalaba137-afk/JAZZY6**, branch **main**.
2. Set **Root Directory** to `server`. For Docker, set **Dockerfile Path** to `./Dockerfile`. For a Node runtime, use Node 24, build command `node --version`, start command `node server.mjs`, and `HOST=0.0.0.0`.
3. Keep your existing `JAZZY_SETUP_TOKEN` in Render Environment. Do not put it in GitHub.
4. Keep the existing persistent database and `JAZZY_DATA_DIR` path. If this is a new database, set `JAZZY_HYU_PASSWORD` and `JAZZY_JAZZY_PASSWORD` in Render Environment to your chosen account passwords. Initial usernames are `hyusukk` and `JAZZY`. Existing database accounts are retained; these variables do not reset passwords.
5. Deploy the latest commit. Visit `/health`: the updated response includes `"protocol":2` and `"features":["username-friends"]`.
6. Install the signed 1.1.1 APK supplied in chat over the existing app. On both phones, log in with the account password and server key. Then one person adds the other username in Friends, and the other accepts.

The Android source currently connects to **https://jazzy-2.onrender.com**. Keep that existing service URL. Creating a different Render service/URL requires changing `CLOUD_SERVER` and rebuilding the APK.

Render storage must be persistent. SQLite data on an ephemeral filesystem can disappear during deploys/restarts. Preserve or back up existing data before redeploying. Do not uninstall the phone app or clear its data; the account password cannot restore lost encryption keys.

## Validation and limits

Run `npm test` with Node 24. Browser integration: `node tests/ui.mjs` with Playwright and Chromium installed. Android build: see `docs/BUILD.md`.

The signed APK build, server/crypto tests and nine browser workflow groups passed. Physical Android testing remains unverified. Encryption uses P-256 ECDH for friend requests and AES-256-GCM for content; compare safety codes after connecting. The protocol has not received an independent security audit and has no forward secrecy.

Historical setup documentation describes version 1.0 invite codes. This README and `docs/UPDATE-1.1.1.md` describe the current username flow.

No account passwords, password seed hashes, setup keys, database or signing keys are included in this repository.
