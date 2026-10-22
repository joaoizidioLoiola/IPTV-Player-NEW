package com.iptvplayernew.desktop;

import android.content.Intent;
import android.os.Bundle;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Iterator;

/**
 * Bridge to the native Media3 player. Only the URL, title, content type,
 * user agent and per-portal headers cross the bridge; the WebView never sees
 * a player object.
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        Intent serviceIntent = new Intent(
            getContext(),
            PlaybackService.class
        )
            .setAction(PlaybackService.ACTION_PLAY)
            .putExtra(PlaybackService.EXTRA_URL, url)
            .putExtra(
                PlaybackService.EXTRA_TITLE,
                valueOr(call.getString("title"), "")
            )
            .putExtra(
                PlaybackService.EXTRA_USER_AGENT,
                valueOr(call.getString("userAgent"), "")
            )
            .putExtra(
                PlaybackService.EXTRA_CONTENT_TYPE,
                valueOr(call.getString("contentType"), "live")
            );
        Long startPosition = call.getLong("startPositionMs");
        serviceIntent.putExtra(
            PlaybackService.EXTRA_START_POSITION,
            startPosition == null ? 0L : startPosition
        );

        JSObject headers = call.getObject("headers");
        if (headers != null) {
            Bundle bundle = new Bundle();
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = headers.optString(key, null);
                if (value != null && !value.isEmpty()) {
                    bundle.putString(key, value);
                }
            }
            serviceIntent.putExtra(PlaybackService.EXTRA_HEADERS, bundle);
        }

        ContextCompat.startForegroundService(getContext(), serviceIntent);

        Intent playerIntent = new Intent(getContext(), PlayerActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        getContext().startActivity(playerIntent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent serviceIntent = new Intent(
            getContext(),
            PlaybackService.class
        ).setAction(PlaybackService.ACTION_STOP);
        getContext().startService(serviceIntent);
        call.resolve();
    }

    /**
     * Hand a stream to an installed external player (VLC, MX Player, ...).
     * Android has no standard header extras for ACTION_VIEW, so only the URL
     * and title travel; portals that require Cookie/Authorization keep the
     * native player.
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        String title = valueOr(call.getString("title"), "");
        Intent viewIntent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(android.net.Uri.parse(url), "video/*")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (!title.isEmpty()) {
            viewIntent.putExtra(Intent.EXTRA_TITLE, title);
        }

        try {
            Intent chooser = Intent.createChooser(viewIntent, title)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (android.content.ActivityNotFoundException noPlayer) {
            call.reject("No installed app can open this stream");
        }
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
