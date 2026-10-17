# JAZZY 1.1 — direct login and username friends

## Required server update

This APK needs the matching server code in this ZIP. Building the APK does not deploy changes to your Render account. The configured address remains https://jazzy-2.onrender.com.

1. In the repository connected to your existing Render service, replace the `server` folder with this version. Include the new `friends.mjs` and updated `relay.mjs` and `Dockerfile`.
2. Keep your existing `JAZZY_SETUP_TOKEN` environment variable and your existing database. Do not delete or reset data. No setup key is embedded in the APK or this ZIP.
3. Deploy the latest repository commit using the Render dashboard. For a Docker service, keep its existing Dockerfile path (`server/Dockerfile` with the build context/root directory set to `server`). For a native Node service, use Node 24, `HOST=0.0.0.0`, and `node server/server.mjs` when the root is the repository; if the root is `server`, use `node server.mjs`.
4. Keep `JAZZY_DATA_DIR` pointed at the existing persistent data directory. This server uses SQLite. An ephemeral Render filesystem can lose accounts, registrations and encrypted history during redeployment; back up your database before deploying and use a persistent disk for durable operation.
5. Install `JAZZY-1.1.apk` over your existing app on both phones. Do not uninstall or clear app data. It has the same package and signing certificate and a higher version code.

## Connect your phones

1. Each person logs in with their own username/password and the same server key. The app opens Home directly.
2. On subsequent logins on that installation, leave the server key blank. The phone's stored credential authenticates its registration.
3. Both people must log in once before connecting. On one phone, open Friends, search the other person's full username, and tap Add friend.
4. On the other phone, open Friends and tap Accept. No invitation text needs copying.
5. Compare Settings → Encryption & safety code over a trusted call. Start chatting and sharing.

Only the two existing accounts are supported. There is no public signup or third account. Friend requests can be declined. A request's connection credential expires after 72 hours; the sender can search and send again to refresh it. Existing paired phones keep their original room and message keys. Existing signed-in installations can log out and log back in with the server key to enable the new Friends registration.

## Encryption and device identity

Phones generate P-256 ECDH identity keys locally and store their private keys in the existing Android Keystore-encrypted vault. Public keys are registered once per account. The sender seals the existing random room secret and one-use join credential using ECDH, HKDF-SHA256 and AES-256-GCM; the server stores only the encrypted request. The envelope context binds server, sender, recipient and room. Message encryption remains the existing AES-256-GCM protocol.

The authenticated server supplies the account public-key directory. Comparing safety codes helps detect substitution by a malicious server. This is not an independently audited Signal-style protocol and provides no forward secrecy. Losing app data or reinstalling loses device keys; account passwords do not recover them. The server refuses silent replacement of a registered device identity.

## Verification for this release

Android compilation, APK v2/v3 signing and alignment succeeded. JavaScript syntax and all five automated test files passed, including direct registration, invalid-key rejection, immutable device binding, case-insensitive username lookup, encrypted friend requests, acceptance and encrypted message exchange.

Updated browser integration tests are included, but were not completed: Chromium could not launch under the sandbox and the additional-permission attempt was cancelled. Physical Android testing and live Render deployment are not verified. Earlier screenshots/test reports in historical releases do not validate this update.
