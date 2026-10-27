package com.bhojanos.customer;

import android.os.Bundle;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OrderBhojanNativeSttPlugin.class);
        registerPlugin(OrderBhojanNativeTrackPlugin.class);
        registerPlugin(OrderBhojanNativeUpiPlugin.class);
        registerPlugin(OrderBhojanNativeChromePlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        disableWebViewCache();
    }

    private void disableWebViewCache() {
        if (getBridge() == null) return;
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
    }
}
