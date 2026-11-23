package com.bulssistudio.meowguard;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;

import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // --- androidx's default scrims: the 3-button navigation bar on Android 8 and 9 keeps a light veil, Android 7 a dark one
    // (it cannot draw dark icons).
    private static final int LIGHT_SCRIM = Color.argb(0xe6, 0xff, 0xff, 0xff);
    private static final int DARK_SCRIM = Color.argb(0x80, 0x1b, 0x1b, 0x1b);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The game's own plugin (Play Games Services v2); npm plugins register themselves.
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
        // Draw under the status and navigation bars on every version, as Android 15 does by itself. The game is cream paper in
        // light and dark mode alike, so the bar icons stay dark. The page asks for viewport-fit=cover and keeps its buttons out
        // of env(safe-area-inset-*) (core/game.ts); Capacitor's SystemBars passes the insets on or pads the WebView.
        EdgeToEdge.enable(
            this,
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.light(LIGHT_SCRIM, DARK_SCRIM)
        );
        applyOrientation(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Folding or unfolding a foldable changes the smallest width without recreating the activity (manifest configChanges).
        applyOrientation(newConfig);
    }

    /**
     * Phones stay portrait. Large screens (smallest width 600 dp and up: tablets, unfolded foldables) turn freely, and the game
     * pillarboxes itself on a wide screen. Android 16 ignores an orientation lock on large screens, so the manifest no longer
     * carries one.
     */
    private void applyOrientation(Configuration config) {
        int wanted = config.smallestScreenWidthDp >= 600
            ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        if (getRequestedOrientation() != wanted) {
            setRequestedOrientation(wanted);
        }
    }
}
