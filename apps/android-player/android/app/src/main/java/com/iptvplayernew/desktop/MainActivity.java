package com.iptvplayernew.desktop;

import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Chromium floor of the Angular bundle. Keep in sync with
     * ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION in
     * libs/shared/interfaces/src/lib/android-runtime-info.ts.
     */
    static final int MIN_WEBVIEW_CHROMIUM_VERSION = 90;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeRuntimePlugin.class);
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        int webViewMajorVersion = currentWebViewMajorVersion();
        if (webViewMajorVersion > 0
            && webViewMajorVersion < MIN_WEBVIEW_CHROMIUM_VERSION) {
            // Do not create the bridge: the bundle is not loaded, no service
            // worker registers and no storage is touched on a WebView that
            // cannot run the bundle. An unparsable version fails open.
            showUnsupportedWebView(webViewMajorVersion);
            return;
        }

        super.load();

        // IPTV panels are frequently served over plain HTTP, while the app
        // origin is https://localhost (Capacitor default). Without this the
        // WebView blocks every stream as mixed content, which surfaces as a
        // "network-error" at the player loader. Media3 (Phase 2) will take over
        // playback natively; this keeps the web player usable in the meantime.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings()
                .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    /** Major Chromium version of the installed WebView, or -1 if unknown. */
    private int currentWebViewMajorVersion() {
        try {
            PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
            if (webViewPackage == null || webViewPackage.versionName == null) {
                return -1;
            }

            String version = webViewPackage.versionName;
            int end = 0;
            while (end < version.length() && Character.isDigit(version.charAt(end))) {
                end++;
            }
            if (end == 0) {
                return -1;
            }

            return Integer.parseInt(version.substring(0, end));
        } catch (RuntimeException unsupported) {
            return -1;
        }
    }

    private void showUnsupportedWebView(int detectedVersion) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0B1220"));
        int padding = dp(32);
        root.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(R.string.webview_update_required_title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);

        TextView message = new TextView(this);
        message.setText(
            getString(
                R.string.webview_update_required_message,
                MIN_WEBVIEW_CHROMIUM_VERSION,
                detectedVersion
            )
        );
        message.setTextColor(Color.parseColor("#C7D2E5"));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        message.setGravity(Gravity.CENTER);
        message.setLineSpacing(0f, 1.2f);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        messageParams.topMargin = dp(16);

        root.addView(title);
        root.addView(message, messageParams);
        setContentView(root);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
