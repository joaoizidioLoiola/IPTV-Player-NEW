package com.iptvplayernew.desktop;

import android.Manifest;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import androidx.media3.ui.PlayerView;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;

import java.util.ArrayList;
import java.util.List;

/**
 * Fullscreen player surface. Playback lives in {@link PlaybackService}; this
 * activity only attaches a MediaController to the PlayerView, so leaving it
 * keeps audio running and never owns (or leaks) the decoder.
 *
 * Track selection is available through the on-screen button and the TV remote
 * MENU/INFO key: the Media3 controller layout does not expose a track menu by
 * default.
 */
@UnstableApi
public class PlayerActivity extends AppCompatActivity {

    private static final int POST_NOTIFICATIONS_REQUEST = 4101;

    private PlayerView playerView;
    private ListenableFuture<MediaController> controllerFuture;
    @Nullable
    private MediaController controller;

    /** Opens this activity from the media notification. */
    static PendingIntent createSessionActivity(Context context) {
        Intent intent = new Intent(context, PlayerActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, 0, intent, flags);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        playerView = createPlayerView();
        FrameLayout root = new FrameLayout(this);
        root.addView(
            playerView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        root.addView(createTracksButton());
        setContentView(root);

        hideSystemBars();
        requestNotificationPermission();
        connectController();
    }

    private PlayerView createPlayerView() {
        PlayerView view = new PlayerView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setUseController(true);
        view.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        view.setKeepScreenOn(true);
        return view;
    }

    private ImageButton createTracksButton() {
        ImageButton button = new ImageButton(this);
        button.setImageResource(android.R.drawable.ic_menu_sort_by_size);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setAlpha(0.75f);
        button.setContentDescription(getString(R.string.tracks_button_description));
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            dp(48),
            dp(48)
        );
        params.gravity = Gravity.TOP | Gravity.END;
        params.setMargins(0, dp(16), dp(16), 0);
        button.setLayoutParams(params);
        button.setOnClickListener(view -> showTrackSelection());
        return button;
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(
                getWindow(),
                getWindow().getDecorView()
            );
        insetsController.hide(WindowInsetsCompat.Type.systemBars());
        insetsController.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }

    private void requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                POST_NOTIFICATIONS_REQUEST
            );
        }
    }

    private void connectController() {
        SessionToken token = new SessionToken(
            this,
            new ComponentName(this, PlaybackService.class)
        );
        controllerFuture = new MediaController.Builder(this, token)
            .setListener(
                new MediaController.Listener() {
                    @Override
                    public void onDisconnected(MediaController mediaController) {
                        finish();
                    }
                }
            )
            .buildAsync();

        controllerFuture.addListener(
            () -> {
                try {
                    controller = controllerFuture.get();
                    playerView.setPlayer(controller);
                } catch (Exception unavailableSession) {
                    finish();
                }
            },
            MoreExecutors.directExecutor()
        );
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (
            keyCode == KeyEvent.KEYCODE_MENU ||
            keyCode == KeyEvent.KEYCODE_INFO
        ) {
            showTrackSelection();
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    private void showTrackSelection() {
        if (controller == null) {
            return;
        }

        List<TrackChoice> choices = new ArrayList<>();
        boolean hasTextTracks = false;
        Tracks tracks = controller.getCurrentTracks();

        for (Tracks.Group group : tracks.getGroups()) {
            int type = group.getType();
            if (type != C.TRACK_TYPE_AUDIO && type != C.TRACK_TYPE_TEXT) {
                continue;
            }
            for (int index = 0; index < group.length; index++) {
                if (!group.isTrackSupported(index)) {
                    continue;
                }
                String name = trackName(group.getTrackFormat(index), type, index);
                int prefixRes = type == C.TRACK_TYPE_AUDIO
                    ? R.string.track_audio_prefix
                    : R.string.track_subtitle_prefix;
                String label = getString(prefixRes, name);
                if (group.isTrackSelected(index)) {
                    label += " ✓";
                }
                choices.add(
                    new TrackChoice(
                        label,
                        group.getMediaTrackGroup(),
                        index,
                        type
                    )
                );
                if (type == C.TRACK_TYPE_TEXT) {
                    hasTextTracks = true;
                }
            }
        }

        if (choices.isEmpty()) {
            Toast.makeText(this, R.string.track_none, Toast.LENGTH_SHORT).show();
            return;
        }

        if (hasTextTracks) {
            boolean textDisabled = controller
                .getTrackSelectionParameters()
                .disabledTrackTypes.contains(C.TRACK_TYPE_TEXT);
            String offLabel = getString(R.string.track_subtitles_off);
            if (textDisabled) {
                offLabel += " ✓";
            }
            choices.add(new TrackChoice(offLabel, null, -1, C.TRACK_TYPE_TEXT));
        }

        String[] labels = new String[choices.size()];
        for (int index = 0; index < choices.size(); index++) {
            labels[index] = choices.get(index).label;
        }

        new AlertDialog.Builder(this)
            .setTitle(R.string.track_selection_title)
            .setItems(
                labels,
                (dialog, which) -> applyTrackChoice(choices.get(which))
            )
            .show();
    }

    private void applyTrackChoice(TrackChoice choice) {
        if (controller == null) {
            return;
        }
        TrackSelectionParameters.Builder builder = controller
            .getTrackSelectionParameters()
            .buildUpon()
            .clearOverridesOfType(choice.type);
        if (choice.group == null) {
            builder.setTrackTypeDisabled(choice.type, true);
        } else {
            builder
                .setTrackTypeDisabled(choice.type, false)
                .setOverrideForType(
                    new TrackSelectionOverride(choice.group, choice.index)
                );
        }
        controller.setTrackSelectionParameters(builder.build());
    }

    private String trackName(Format format, int type, int index) {
        if (format.label != null) {
            return format.label;
        }
        if (format.language != null) {
            return format.language;
        }
        int fallbackRes = type == C.TRACK_TYPE_AUDIO
            ? R.string.track_audio_fallback
            : R.string.track_subtitle_fallback;
        return getString(fallbackRes, index + 1);
    }

    private int dp(int value) {
        return Math.round(
            value * getResources().getDisplayMetrics().density
        );
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (controller != null) {
            playerView.setPlayer(controller);
        }
    }

    @Override
    protected void onStop() {
        // Detach the surface; the service keeps decoding audio.
        playerView.setPlayer(null);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        playerView.setPlayer(null);
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
            controllerFuture = null;
        }
        controller = null;
        super.onDestroy();
    }

    private static final class TrackChoice {
        final String label;
        @Nullable
        final TrackGroup group;
        final int index;
        final int type;

        TrackChoice(
            String label,
            @Nullable TrackGroup group,
            int index,
            int type
        ) {
            this.label = label;
            this.group = group;
            this.index = index;
            this.type = type;
        }
    }
}
