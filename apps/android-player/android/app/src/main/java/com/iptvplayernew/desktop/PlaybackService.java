package com.iptvplayernew.desktop;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import java.util.HashMap;
import java.util.Map;

/**
 * Owns the ExoPlayer instance so playback keeps running when the fullscreen
 * activity is dismissed (background audio, notification controls).
 *
 * The player is built once with a mutable HTTP data-source factory: a play
 * request updates the user agent and portal headers before the media item is
 * prepared, which avoids rebuilding the player (and its MediaSession) on
 * every channel switch.
 */
@UnstableApi
public class PlaybackService extends MediaSessionService {

    static final String ACTION_PLAY = "com.iptvplayernew.desktop.action.PLAY";
    static final String ACTION_STOP = "com.iptvplayernew.desktop.action.STOP";
    static final String EXTRA_URL = "url";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_USER_AGENT = "userAgent";
    static final String EXTRA_CONTENT_TYPE = "contentType";
    static final String EXTRA_START_POSITION = "startPositionMs";
    static final String EXTRA_HEADERS = "headers";

    private ExoPlayer player;
    private MediaSession mediaSession;
    private DefaultHttpDataSource.Factory httpDataSourceFactory;
    private MediaItem currentItem;
    private boolean currentIsLive;
    private boolean hlsFallbackTried;

    @Override
    public void onCreate() {
        super.onCreate();

        DefaultMediaNotificationProvider notificationProvider =
            new DefaultMediaNotificationProvider.Builder(this)
                .setChannelId("iptv_playback")
                .setChannelName(R.string.playback_channel_name)
                .build();
        setMediaNotificationProvider(notificationProvider);

        httpDataSourceFactory = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000);

        player = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(
                new DefaultMediaSourceFactory(httpDataSourceFactory)
            )
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                true
            )
            .setHandleAudioBecomingNoisy(true)
            .build();

        player.addListener(
            new Player.Listener() {
                @Override
                public void onPlayerError(PlaybackException error) {
                    maybeRetryAsHls();
                }
            }
        );

        mediaSession = new MediaSession.Builder(this, player)
            .setSessionActivity(PlayerActivity.createSessionActivity(this))
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_PLAY.equals(intent.getAction())) {
            handlePlay(intent);
        } else if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            player.stop();
            stopSelf();
        }
        return START_STICKY;
    }

    private void handlePlay(Intent intent) {
        String url = intent.getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) {
            stopSelf();
            return;
        }

        String title = valueOr(intent.getStringExtra(EXTRA_TITLE), "");
        String userAgent = valueOr(
            intent.getStringExtra(EXTRA_USER_AGENT),
            "IPTV Player NEW"
        );
        boolean isLive = "live".equals(
            valueOr(intent.getStringExtra(EXTRA_CONTENT_TYPE), "live")
        );
        long startPositionMs = intent.getLongExtra(EXTRA_START_POSITION, 0L);

        httpDataSourceFactory
            .setUserAgent(userAgent)
            .setDefaultRequestProperties(readHeaders(intent));

        MediaItem.Builder itemBuilder = new MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(
                new MediaMetadata.Builder().setTitle(title).build()
            );
        if (isLive) {
            itemBuilder.setLiveConfiguration(
                new MediaItem.LiveConfiguration.Builder()
                    .setTargetOffsetMs(3000L)
                    .build()
            );
        }

        currentItem = itemBuilder.build();
        currentIsLive = isLive;
        hlsFallbackTried = false;

        player.setMediaItem(currentItem);
        if (startPositionMs > 0) {
            player.seekTo(startPositionMs);
        }
        player.prepare();
        player.play();
    }

    /**
     * Some panels serve an HLS playlist behind a `.ts` URL (redirect or
     * mislabelled extension). The progressive extractor then fails; retry the
     * same URI as HLS once. Real MPEG-TS streams never reach this path.
     */
    private void maybeRetryAsHls() {
        if (!currentIsLive || hlsFallbackTried || currentItem == null) {
            return;
        }
        if (currentItem.localConfiguration == null) {
            return;
        }
        String uri = String.valueOf(currentItem.localConfiguration.uri);
        if (uri.isEmpty() || uri.contains(".m3u8")) {
            return;
        }

        hlsFallbackTried = true;
        player.setMediaSource(
            new HlsMediaSource.Factory(httpDataSourceFactory)
                .createMediaSource(currentItem)
        );
        player.prepare();
        player.play();
    }

    private static Map<String, String> readHeaders(Intent intent) {
        Map<String, String> headers = new HashMap<>();
        Bundle bundle = intent.getBundleExtra(EXTRA_HEADERS);
        if (bundle == null) {
            return headers;
        }
        for (String key : bundle.keySet()) {
            String value = bundle.getString(key);
            if (value != null && !value.isEmpty()) {
                headers.put(key, value);
            }
        }
        return headers;
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (player == null || !player.getPlayWhenReady()) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
