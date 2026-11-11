package com.bulssistudio.meowguard;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.tasks.Task;

/**
 * Google Play Games Services v2 for the game (docs: developer.android.com/games/pgs/android/android-signin, achievements;
 * play-services-games-v2 22.1.0). Achievements only (accounts and the cloud save are Firebase's, the ranking is Cloud Functions'): PGS signs the player in by itself at start; signIn() is the manual retry of the
 * title's and the settings' connect button. Achievements need a signed-in player. The game stays playable without it (Google's guidance: PGS is never the primary identity).
 *
 * Without a Play Games Services project id in the manifest (gradle property pgsProjectId) the SDK is not initialised and every call
 * answers "not available": a build made before the Play Console setup runs as before.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {
    private boolean ready = false;

    @Override
    public void load() {
        String projectId = manifestValue("com.google.android.gms.games.APP_ID");
        if (projectId == null || projectId.trim().isEmpty() || projectId.trim().equals("0")) return;
        PlayGamesSdk.initialize(getContext());
        ready = true;
    }

    private String manifestValue(String key) {
        try {
            ApplicationInfo info = getContext()
                .getPackageManager()
                .getApplicationInfo(getContext().getPackageName(), PackageManager.GET_META_DATA);
            Bundle meta = info.metaData;
            if (meta == null || !meta.containsKey(key)) return null;
            Object v = meta.get(key);
            return v == null ? null : String.valueOf(v);
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    private boolean refuseIfOff(PluginCall call) {
        if (ready && getActivity() != null) return false;
        JSObject r = new JSObject();
        r.put("available", false);
        r.put("authenticated", false);
        call.resolve(r);
        return true;
    }

    private void resolveAuth(PluginCall call, Task<AuthenticationResult> task) {
        task.addOnCompleteListener(t -> {
            JSObject r = new JSObject();
            r.put("available", true);
            r.put("authenticated", t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated());
            call.resolve(r);
        });
    }

    /** Whether PGS has signed the player in (the automatic sign-in at start may still be running: ask again later). */
    @PluginMethod
    public void isAuthenticated(PluginCall call) {
        if (refuseIfOff(call)) return;
        GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        resolveAuth(call, client.isAuthenticated());
    }

    /** The manual sign-in (the connect button): PGS shows its own account and profile screens. */
    @PluginMethod
    public void signIn(PluginCall call) {
        if (refuseIfOff(call)) return;
        GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        resolveAuth(call, client.signIn());
    }

    /** The signed-in player's Play Games name (shown on the title). The player id is for this device's use only, never as a key on a server. */
    @PluginMethod
    public void getPlayer(PluginCall call) {
        if (refuseIfOff(call)) return;
        PlayGames.getPlayersClient(getActivity()).getCurrentPlayer().addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null) {
                call.reject("player unavailable");
                return;
            }
            JSObject r = new JSObject();
            r.put("playerId", t.getResult().getPlayerId());
            r.put("displayName", t.getResult().getDisplayName());
            call.resolve(r);
        });
    }

    /** Unlocks an achievement (fire and forget: PGS queues it offline and ignores an already unlocked one). */
    @PluginMethod
    public void unlockAchievement(PluginCall call) {
        if (refuseIfOff(call)) return;
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        PlayGames.getAchievementsClient(getActivity()).unlock(id);
        JSObject r = new JSObject();
        r.put("available", true);
        call.resolve(r);
    }

    /** Adds steps to an incremental achievement (PGS caps it at the achievement's total steps). */
    @PluginMethod
    public void incrementAchievement(PluginCall call) {
        if (refuseIfOff(call)) return;
        String id = call.getString("id");
        Integer steps = call.getInt("steps");
        if (id == null || id.isEmpty() || steps == null || steps <= 0) {
            call.reject("id and a positive steps are required");
            return;
        }
        PlayGames.getAchievementsClient(getActivity()).increment(id, steps);
        JSObject r = new JSObject();
        r.put("available", true);
        call.resolve(r);
    }

    /** Google's achievements screen. Resolves when the player closes it. */
    @PluginMethod
    public void showAchievements(PluginCall call) {
        if (refuseIfOff(call)) return;
        PlayGames.getAchievementsClient(getActivity()).getAchievementsIntent().addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null) {
                call.reject("achievements unavailable");
                return;
            }
            startActivityForResult(call, t.getResult(), "achievementsClosed");
        });
    }

    @ActivityCallback
    private void achievementsClosed(PluginCall call, ActivityResult result) {
        if (call != null) call.resolve();
    }
}
