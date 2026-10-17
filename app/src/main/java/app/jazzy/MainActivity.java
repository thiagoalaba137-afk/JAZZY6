package app.jazzy;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Bundled, trusted UI only. External pages never receive the JavaScript bridge. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/index.html";
    private static final String KEY_ALIAS = "jazzy.vault.aes.v1";
    private static final int PICK_FILE = 41;
    private static final int SAVE_FILE = 42;
    private static final Set<String> ASSETS = new HashSet<String>(Arrays.asList(
        "index.html", "styles.css", "app.mjs", "crypto.mjs", "model.mjs", "demo-gwangju.svg", "demo-azul.svg"
    ));
    private WebView web;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> fileCallback;
    private volatile String backendOrigin = "";
    private String sharedText = "";
    private boolean loaded = false;
    private byte[] pendingDownload;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(Color.rgb(243,250,255));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        preferences = getSharedPreferences("jazzy-vault", MODE_PRIVATE);
        try { updateOrigin(readVault()); } catch (Exception ignored) { /* UI reports locked vault. */ }
        captureShare(getIntent());
        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(Color.rgb(243,250,255));
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Scoped document-picker URI access, no storage permission.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebView.setWebContentsDebuggingEnabled(false);
        android.webkit.CookieManager.getInstance().setAcceptCookie(false);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(), "Jazzy");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPort() == -1) {
                    String path = uri.getPath();
                    String name = path != null && path.startsWith("/assets/") ? path.substring(8) : "";
                    if (!ASSETS.contains(name) || !"GET".equals(request.getMethod())) return blocked();
                    try {
                        String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : name.endsWith(".svg") ? "image/svg+xml" : "text/javascript";
                        InputStream stream = getAssets().open(name);
                        HashMap<String,String> headers = new HashMap<String,String>();
                        headers.put("Cache-Control", "no-store");
                        headers.put("X-Content-Type-Options", "nosniff");
                        if (name.endsWith(".html")) headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src https:; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream);
                    } catch (Exception ignored) { return blocked(); }
                }
                // Only the explicitly configured HTTPS relay can be fetched.
                String origin = uri.getScheme() + "://" + uri.getEncodedAuthority();
                if ("https".equals(uri.getScheme()) && !backendOrigin.isEmpty() && backendOrigin.equals(origin) && uri.getUserInfo() == null) return null;
                if ("data".equals(uri.getScheme()) || "blob".equals(uri.getScheme())) return null;
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // All navigation, including remote pages and deep links, is blocked inside the bridge-bearing WebView.
                return !START.equals(request.getUrl().toString());
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); }
            @Override public void onPageFinished(WebView view, String url) {
                loaded = START.equals(url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                ArrayList<String> requested = new ArrayList<String>();
                for (String entry : params.getAcceptTypes()) for (String mime : entry.split(",")) {
                    String clean = mime.trim();
                    if (clean.matches("(image/(jpeg|png|webp)|video/(mp4|webm)|audio/(mp4|webm|ogg))")) requested.add(clean);
                }
                if (!requested.isEmpty()) pick.putExtra(Intent.EXTRA_MIME_TYPES, requested.toArray(new String[0]));
                pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(pick, PICK_FILE); }
                catch (Exception ignored) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        web.loadUrl(START);
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", new HashMap<String,String>(), new ByteArrayInputStream(new byte[0]));
    }
    private SecretKey vaultKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(KEY_ALIAS, null);
    }
    private synchronized String readVault() throws Exception {
        String saved = preferences.getString("ciphertext", "");
        if (saved.isEmpty()) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP);
        cipher.init(Cipher.DECRYPT_MODE, vaultKey(), new GCMParameterSpec(128, iv));
        cipher.updateAAD("JAZZY/AndroidVault/v1".getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(Base64.decode(saved, Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    private void updateOrigin(String value) throws Exception {
        if (value.isEmpty()) { backendOrigin = ""; return; }
        String server = new JSONObject(value).getString("server");
        Uri uri = Uri.parse(server);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || (uri.getPath() != null && !uri.getPath().isEmpty())) throw new IllegalArgumentException("HTTPS origin required");
        backendOrigin = server;
    }
    private synchronized void writeVault(String value) throws Exception {
        if (value.length() > 16000) throw new IllegalArgumentException("Vault too large");
        if (value.isEmpty()) {
            if (!preferences.edit().clear().commit()) throw new IllegalStateException("Storage error");
            backendOrigin = "";
            return;
        }
        // Validate before overwriting a recoverable key.
        JSONObject data = new JSONObject(value);
        if (!data.getString("token").matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("Invalid device credential");
        String state = data.getString("state");
        if ("lobby".equals(state)) {
            JSONObject identity = data.getJSONObject("identity");
            JSONObject privateKey = identity.getJSONObject("privateKey");
            if (!identity.getString("publicKey").matches("[A-Za-z0-9_-]{87}") ||
                !"EC".equals(privateKey.getString("kty")) || !"P-256".equals(privateKey.getString("crv")) ||
                !privateKey.getString("d").matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("Invalid device identity");
        } else {
            if (!("active".equals(state) || "creating".equals(state) || "joining".equals(state)) ||
                !data.getString("key").matches("[A-Za-z0-9_-]{43}") || !data.getString("room").matches("[A-Za-z0-9_-]{22}")) throw new IllegalArgumentException("Invalid room vault");
        }
        updateOrigin(value);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, vaultKey());
        cipher.updateAAD("JAZZY/AndroidVault/v1".getBytes(StandardCharsets.UTF_8));
        String encrypted = Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        if (!preferences.edit().putString("ciphertext", encrypted).putString("iv", iv).commit()) throw new IllegalStateException("Storage error");
    }
    public final class Bridge {
        @JavascriptInterface public String allowServer(String server) {
            try { updateOrigin(new JSONObject().put("server",server).toString()); return "ok"; }
            catch (Exception ignored) { return "error"; }
        }
        @JavascriptInterface public String readVault() {
            try { return MainActivity.this.readVault(); } catch (Exception ignored) { return "!LOCKED"; }
        }
        @JavascriptInterface public String writeVault(String value) {
            try { MainActivity.this.writeVault(value); return "ok"; } catch (Exception ignored) { return "error"; }
        }
        @JavascriptInterface public synchronized String consumeSharedText() {
            String text = sharedText; sharedText = ""; return text;
        }
        @JavascriptInterface public void openInstagram(final String url) {
            if (url == null || !url.matches("https://(www\\.)?instagram\\.com/reels?(/[A-Za-z0-9_-]+)?/?")) return;
            runOnUiThread(new Runnable() { public void run() {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception ignored) { Toast.makeText(MainActivity.this, "Install a browser or Instagram to open this Reel.", Toast.LENGTH_LONG).show(); }
            }});
        }
        @JavascriptInterface public void shareText(final String text) {
            if (text == null || text.length() > 6000) return;
            runOnUiThread(new Runnable() { public void run() {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");share.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(share, "Send privately to your partner"));
            }});
        }
        @JavascriptInterface public void saveFile(final String name, String base64) {
            if (name == null || name.length() > 180 || base64 == null || base64.length() > 12000000 || pendingDownload != null) return;
            try { pendingDownload = Base64.decode(base64, Base64.DEFAULT); } catch (Exception ignored) { return; }
            if (pendingDownload.length > 8*1024*1024) { pendingDownload=null; return; }
            runOnUiThread(new Runnable() { public void run() {
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/octet-stream");
                save.putExtra(Intent.EXTRA_TITLE,name.replaceAll("[\\\\/\\p{Cntrl}]","_"));
                try { startActivityForResult(save,SAVE_FILE); } catch(Exception ignored) { pendingDownload=null; }
            }});
        }
        @JavascriptInterface public void minimize() { runOnUiThread(new Runnable() { public void run() { moveTaskToBack(true); }}); }
    }
    private void captureShare(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() <= 6000) sharedText = text;
        }
    }
    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);setIntent(intent);captureShare(intent);
        if (loaded && !sharedText.isEmpty()) {
            String text = sharedText; sharedText = "";
            web.evaluateJavascript("window.jazzyReceiveShare && window.jazzyReceiveShare(" + JSONObject.quote(text) + ")", null);
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if (request == SAVE_FILE && pendingDownload != null) {
            final byte[] bytes=pendingDownload;pendingDownload=null;
            final Uri target=result==RESULT_OK&&data!=null?data.getData():null;
            if(target!=null&&"content".equals(target.getScheme()))new Thread(new Runnable(){public void run(){
                try(java.io.OutputStream out=getContentResolver().openOutputStream(target)){if(out!=null)out.write(bytes);}
                catch(Exception ignored){runOnUiThread(new Runnable(){public void run(){Toast.makeText(MainActivity.this,"Could not save this file.",Toast.LENGTH_LONG).show();}});}
                finally{Arrays.fill(bytes,(byte)0);}
            }}).start();
        }
        if (request == PICK_FILE && fileCallback != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
            fileCallback = null;
        }
    }
    @Override public void onBackPressed() { if (loaded) web.evaluateJavascript("window.jazzyBack && window.jazzyBack()", null); else super.onBackPressed(); }
    @Override protected void onPause() { if(web!=null){web.onPause();web.pauseTimers();}super.onPause(); }
    @Override protected void onResume() { super.onResume();if(web!=null){web.onResume();web.resumeTimers();if(loaded)web.evaluateJavascript("window.dispatchEvent(new Event('online'))", null);} }
    @Override protected void onDestroy() { if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("Jazzy");web.destroy();}super.onDestroy(); }
}
