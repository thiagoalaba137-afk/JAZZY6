# JAZZY security design and limits

This is an implementation of end-to-end encryption using platform cryptographic primitives. It is not Signal Protocol, has not been independently audited, and does not provide forward secrecy or post-compromise security. Do not describe it as having Signal's or Instagram's security assurances.

## Encryption protocol v1

The creator's phone generates a 256-bit random pair secret with `crypto.getRandomValues`. It generates independent random device-access and invitation tokens, so compromising the server's authorization state does not by itself disclose the content key.

The pair secret is delivered to the second phone inside a private, out-of-band invitation. The invitation also contains the HTTPS relay origin, random 128-bit room ID, the one-use 256-bit join token, and the intended second identity. The pair secret is never included in a relay API request.

Both phones use Web Crypto HKDF-SHA-256 with the room ID as salt and `JAZZY/v1/events/AES-256-GCM` as info to derive a non-exportable AES-256-GCM key. Every event uses a fresh random 96-bit nonce and a 128-bit authentication tag. Authenticated additional data is a canonical JSON object containing protocol version, room, event ID, author, and client timestamp. Changing any of those fields, the nonce, or ciphertext causes decryption to fail.

Payloads include chat, media, posts, captions, comments, likes, profiles, read receipts, and removal events. Media is embedded inside the encrypted payload. The relay cannot read payload types or contents. It can see room membership, event ID, claimed author, timestamps, sizes, access patterns, IP addresses, and delivery order. TLS protects the transport. The server can withhold, replay, or delete events; client-side IDs and server idempotency limit accidental duplicate delivery, but availability is not cryptographically guaranteed.

The safety code is the first 128 bits of SHA-256 over a domain-separated string containing the room ID and pair secret. Comparing all eight four-digit hex groups over a trusted call checks that both devices have the same secret. It does not authenticate real-world identities by itself. Anyone with the unused invite can take the second place. Because both participants hold the same secret, neither is protected from impersonation by the other participant.

## Android client

The UI is bundled in the APK and served from a fixed HTTPS asset origin inside Android WebView. No remote code is loaded. A restrictive Content Security Policy prohibits remote scripts, frames, plugins, and inline scripts. User-provided text is escaped; received media must be a supported base64 data URL. Navigation is restricted to the bundled entrypoint. Only the configured HTTPS relay is allowed for network fetches. Instagram links open outside the bridge-bearing WebView.

Device credentials and the pair secret are encrypted at rest with an AES-256-GCM wrapping key generated in Android Keystore. Keystore keys may be hardware-backed depending on the device; hardware backing is not claimed or required. Secrets must exist in process memory while the app is in use. The wrapping key is not bound to biometric authentication in this release.

The event cache and pending outbox in IndexedDB contain ciphertext, not plaintext messages. Bookmarked post IDs are ordinary local metadata. Android backup and WebView debugging are disabled in the release manifest. HTTP cleartext is disabled and TLS errors fail closed. The secure-window flag is enabled. The scoped document picker grants access only to files the user selects.

Browser preview is a development aid. It does not persist pairing keys in real browser storage, and is not the production client. Browser test mocks intentionally simulate native key storage and are not shipped in the APK.

## Password login

There are exactly two seeded accounts: hyusukk and JAZZY. The initial supplied passwords are stored as independently salted scrypt hashes (N=16384, r=8, p=1), never in the Android assets or as plaintext files. Passwords are submitted only to the configured HTTPS relay and are not logged. Rate limits bound login attempts. Sessions use random 256-bit tokens, expire after 30 days, and are replaced by a new login or account change. Authenticated room requests require both the account session and the paired device credential. Changing the username/password requires the existing password.

The password is separate from the randomly generated pair encryption secret. The server knowing a login password does not reveal the content key. Logging out retains the phone's Keystore-protected vault but clears active credentials and plaintext UI state. Logging in on a new or reset phone does not recover the content key. Display names and usernames are visible to the account server; encrypted profile events also propagate changes to the partner.

Chat supports encrypted generic file attachments up to 8 MB. Received files are downloaded through Android's create-document picker and are not executed inside WebView.

## Relay

One room and two device credentials are allowed. The setup token is provided as a server environment variable. Tokens are random 256-bit values; only SHA-256 hashes of room device/join tokens are stored. Constant-time comparisons authenticate them. The invite expires in 72 hours, and a filled second slot cannot be replaced via the join endpoint.

Requests have bounded bodies, strict envelope checks, parameterized SQL, a storage quota, request timeouts, and simple in-memory rate limits. Only the bundled app origin is permitted by CORS in production. TLS is terminated by Caddy; the relay has no publicly exposed internal port. The app does not log tokens or plaintext. Administrators must also keep reverse-proxy/hosting logs free of request bodies and authorization headers.

The server only validates encrypted envelope structure; it cannot prove that an authorized client encrypted a valid payload. A malicious partner can upload invalid content, exhaust the shared quota, or copy everything they can decrypt. Rate limits are coarse and are not a full denial-of-service defense. Only deploy one relay process per SQLite volume.

## Intentional first-version limits

- A stolen pair secret exposes past and future content using that key; there is no ratchet or automatic rotation.
- A compromised phone, malicious OS/WebView, malicious APK update, or stolen invitation can defeat confidentiality.
- Phone recovery, key export, device migration, and revocation are not implemented. Resetting a pair creates a new history and key.
- Removing posts or expiring stories affects visibility. Ciphertext may remain in caches and server backups.
- Metadata is visible to the server. Instagram learns about links opened in its app or website.
- Encryption tests are necessary checks, not an independent security audit or a guarantee of secure operation on every Android device.

## References

- [Android Keystore system](https://developer.android.com/privacy-and-security/keystore)
- [Android cryptography guidance](https://developer.android.com/privacy-and-security/cryptography)
- [Android in-app WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [Web Crypto API specification](https://www.w3.org/TR/WebCryptoAPI/)
- [Meta's Instagram API documentation](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
