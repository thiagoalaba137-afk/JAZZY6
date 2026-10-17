# JAZZY — setup for Hyu Suk & Jazzy

JAZZY is a private, light-blue Android social app for **Hyu Suk** in Gwangju and **Jazzy** (Jasmin) in Azul. It has two places, one per phone. There is no public registration or public feed.

The app has an offline preview with clearly labeled sample illustrations and messages. Sharing between phones requires deploying the included server. This project does not create a hosting account or provision a paid server for you.

## 1. Install the Android app

When the APK has been built, copy `JAZZY-1.0.apk` to each phone. Open it and allow installation from your browser or file manager when Android asks. It requires Android 8.0 or newer and an up-to-date Android System WebView/Chrome. The package name is `app.jazzy`.

Use **Take a look around first** to explore the light-blue interface without a server. Preview messages and posts are temporary samples. They are not sent anywhere and do not migrate into the real pair.

If your download contains only source, build the APK using [BUILD.md](BUILD.md). Do not rename the source ZIP to `.apk`.

## 2. Prepare a small server

You need a Linux server with Docker Engine and the Docker Compose plugin, a domain or subdomain pointing at its public IP, and inbound TCP ports 80 and 443. A basic VPS is enough for two people. Your hosting provider may charge for it.

Copy the `server` folder to the server. The app's HTTPS endpoint must be at the root of its own domain, for example `https://jazzy.your-domain.com`. Paths such as `/jazzy` are not supported.

Inside that folder, create a `.env` file by copying `.env.example`:

```sh
cp .env.example .env
chmod 600 .env
```

Generate a random setup key using Node 24 on your computer/server:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

You can also generate a 43-character base64url key using Python 3:

```sh
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Edit `.env`:

```dotenv
JAZZY_DOMAIN=jazzy.your-domain.com
JAZZY_SETUP_TOKEN=the_43_character_key_you_just_generated
```

The placeholder above is an example; replace it with the generated key. Keep this key private. It is separate from your message encryption key.

Start the service:

```sh
docker compose up -d --build
docker compose logs --tail=50
```

Caddy obtains and renews a TLS certificate. DNS must point to this server, and ports 80/443 must be reachable. The relay is only accessible through Caddy; its internal port 8787 is not published.

Open `https://jazzy.your-domain.com/health`. You should see:

```json
{"ok":true,"app":"JAZZY","protocol":1}
```

The health endpoint reveals no personal content. The other endpoints require a secret setup key, private invitation, or device credential.

## 3. Log in and connect Hyu Suk's phone

1. Open JAZZY, tap **Log in to JAZZY**, and enter your HTTPS server address.
2. Log in as **hyusukk**, using the password you supplied. The server includes its salted password hash; plaintext passwords are not shipped in the APK.
3. Choose **Create our space**, enter the setup key from `.env`, then tap **Create & get an invite**.
4. Send the private invite to Jazzy through a trusted private channel. It contains your pair encryption key, so do not post it publicly.

If Jazzy creates the space first, log in to **JAZZY** instead; the invite will be for Hyu Suk. Only one person creates a space. The second person always joins by invitation.

Invites expire after 72 hours. Before the second phone joins, the creator can use **Settings → Invite → Create a fresh invite**. Once both phones are paired, another phone cannot join with the old invite.

## 4. Connect Jazzy's phone

1. Install the same APK, enter the same server address, and log in as **JAZZY** using the password you supplied for her account. Then tap **I have an invite**.
2. Paste the entire private invite, starting with `jazzy1.`.
3. Tap **Join our space**.
4. On both phones, open **Settings → Encryption & safety code**. Compare the whole code over a trusted call. It must match exactly.

The initial accounts are **hyusukk** (Hyu Suk) and **JAZZY** (Jazzy). In **Us → Settings → Account & password**, each person can change their display name, username, and password. Changing account details requires the current password; a new password must have at least eight characters. It does not change the private conversation key. Bios, cities, and time zones are editable under **Edit profile**.

**Log out** locks the app while retaining its encrypted keys on that phone. Log back into the same account on the same phone to continue. A login on another device replaces the prior login session, but does not transfer the encryption key; initial pairing is still necessary. There is no open signup or third account.

The supplied initial passwords are stored only as salted scrypt hashes in `server/accounts.seed.json`. To choose different initial passwords before the first deployment, run `python3 scripts/seed-accounts.py`; it prompts without echoing passwords. Once a database exists, changes are made through the app, not by editing the seed file.

Azul initially uses Argentina/Buenos Aires time. Change it under **Edit profile** if that is not the intended Azul.

## Everyday use

- **Home:** post photos/videos, like, comment, or save posts on this phone.
- **Stories:** share moments visible for 24 hours. Tap a person's story circle to view them.
- **Create:** choose a photo/video and caption. Images are resized to a maximum dimension of 1600 pixels and re-encoded as JPEG, stripping common image metadata. Videos/audio must be 8 MB or smaller; their original file metadata is retained.
- **Reels:** share an Instagram Reel to JAZZY through Android's share menu, or paste its direct link. Tap **Watch on Instagram** to open the Reel in Instagram or a browser. You may also share your own short video.
- **Chat:** send text, photos, short videos, audio clips, or other files such as PDFs and documents. File attachments are limited to 8 MB each; tap a received file to save it using Android’s file picker. Pending messages are stored encrypted on the phone and retried when the app is open and online. Delivery/read indicators update when the partner opens JAZZY.
- **Us:** view the two profiles and your private collection of saved posts.

Both phones sync approximately every four seconds while JAZZY is open. This version does **not** include background push notifications, voice/video calls, live broadcasting, face filters, editing tools, music licensing, Instagram account login, or Instagram's personalized recommendations. It implements the core two-person sharing experience, not every Instagram feature.

Instagram controls whether a linked Reel is available, requires login, or is restricted by account/privacy settings. JAZZY does not scrape Instagram or download its videos.

## Storage, maintenance, and recovery

The relay keeps encrypted events in a SQLite database in the persistent Docker volume `jazzy_data`. The default limit is **512 MB** and **50,000 events** for the pair. Increase `JAZZY_MAX_ROOM_MB` in `compose.yaml` and restart the relay if you need more space. Photos are compressed by the app; the base64/encryption representation uses more storage than the original file.

Back up the Docker volume with the relay stopped for a consistent SQLite copy. Store backups privately. Database backups contain encrypted content and hashed access tokens, not the pair encryption key. A server backup cannot recover your phone's lost key.

The encryption key is saved on each Android phone under an Android Keystore wrapping key. Android backup is disabled for this app. **Uninstalling the app, clearing its data, using “Forget this phone,” or losing both phones can permanently lose access to the shared history.** This first version has no key-export, account-password recovery, or phone-migration flow.

For a normal app update, install an APK with the same package name and signing key over the existing app. Do not uninstall first. Back up the private signing materials generated by the build script if you will build future updates.

If you need to start over, preserve any content you need while the original devices still work. After both people agree to reset, stop the service and remove the old `jazzy_data` volume using your Docker administration tools, then restart and create a new pair. This is destructive and does not recover old content. Alternatively, the creator's authenticated `DELETE /v1/rooms/{room}` API supports an explicit JSON confirmation equal to the room ID. That destructive action is deliberately not an ordinary app button.

Removing a post hides it after both clients sync; stories expire from view after 24 hours. These actions do not cryptographically erase old ciphertext from server/device backups, and cannot erase a copy your partner already kept.

## Troubleshooting

**Cannot connect:** use a full HTTPS domain with no trailing path. Check `/health`, DNS, firewall rules, Caddy logs, and the TLS certificate. Self-signed certificates and plain HTTP are not accepted by the APK. Do not disable certificate validation.

**The server already has a pair:** use the existing partner invite. Do not keep creating new spaces.

**Invite expired:** the creator can generate a fresh invite while the second place is still empty.

**Both places are taken:** an old invite cannot re-register a removed or reinstalled phone. See the recovery limits above.

**Message waiting to send:** leave the app open with connectivity to the relay. A retry uses the same event ID, so a lost response does not create duplicate messages.

**Content could not be verified:** compare the safety codes. Do not assume an unreadable or altered message is authentic.

**File selection:** posts accept JPEG/PNG/WebP images and MP4/WebM video. Chat also accepts audio and other file types up to 8 MB. JAZZY uses Android's scoped file picker and does not request access to your entire photo library.

**Screenshots are blocked:** the Android client enables Android's secure-window flag to reduce accidental capture of the private app. Device behavior can vary; this does not protect against a compromised device or an external camera.
