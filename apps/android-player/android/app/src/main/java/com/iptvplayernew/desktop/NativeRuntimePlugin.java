package com.iptvplayernew.desktop;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Runtime facts that only the Android shell can answer.
 *
 * Phase 1 exposes the TV mode only. `UiModeManager` is the authoritative
 * source; the WebView cannot read it, which is why
 * `AndroidRuntimeInfo.isAndroidTv` is false in the renderer until this plugin
 * answers. The renderer consumes the answer asynchronously and must not use it
 * for layout decisions before phase 3.
 */
@CapacitorPlugin(name = "NativeRuntime")
public class NativeRuntimePlugin extends Plugin {

    @PluginMethod
    public void getIsTv(PluginCall call) {
        UiModeManager uiModeManager =
            (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        boolean isTv =
            uiModeManager != null
                && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;

        JSObject result = new JSObject();
        result.put("isTv", isTv);
        call.resolve(result);
    }
}
