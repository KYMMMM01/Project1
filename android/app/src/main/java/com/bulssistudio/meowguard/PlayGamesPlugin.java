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
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesClientStatusCodes;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Task;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Google Play Games Services v2 for the game (docs: developer.android.com/games/pgs/android/android-signin, leaderboards, saved-games;
 * play-services-games-v2 22.1.0). Platform sign-in only: PGS signs the player in by itself at start; signIn() is the manual retry of the
 * title's and the settings' connect button. The game stays playable without it (Google's guidance: PGS is never the primary identity).
 *
 * Without a Play Games Services project id in the manifest (gradle property pgsProjectId) the SDK is not initialised and every call
 * answers "not available": a build made before the Play Console setup runs as before.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {
    /** Saved Games refuses more than 3 MB of data per snapshot. */
    private static final int MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024;

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

    /** A score for a leaderboard (PGS keeps each player's best; the game sends a new record once, at the end of a run). */
    @PluginMethod
    public void submitScore(PluginCall call) {
        if (refuseIfOff(call)) return;
        String id = call.getString("leaderboardId");
        Long score = call.getLong("score");
        if (id == null || id.isEmpty() || score == null) {
            call.reject("leaderboardId and score are required");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity()).submitScoreImmediate(id, score).addOnCompleteListener(t -> {
            JSObject r = new JSObject();
            r.put("available", true);
            r.put("submitted", t.isSuccessful());
            call.resolve(r);
        });
    }

    /** Google's leaderboard screen (daily, weekly and all-time tabs). */
    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        if (refuseIfOff(call)) return;
        String id = call.getString("leaderboardId");
        if (id == null || id.isEmpty()) {
            call.reject("leaderboardId is required");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity()).getLeaderboardIntent(id).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null) {
                call.reject("leaderboard unavailable");
                return;
            }
            startActivityForResult(call, t.getResult(), "leaderboardClosed");
        });
    }

    @ActivityCallback
    private void leaderboardClosed(PluginCall call, ActivityResult result) {
        if (call != null) call.resolve();
    }

    /** Writes the cloud save (text, at most 3 MB). The most recently written copy wins when two devices wrote at once. */
    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        if (refuseIfOff(call)) return;
        String name = call.getString("name");
        String data = call.getString("data");
        String description = call.getString("description", "");
        if (name == null || name.isEmpty() || data == null) {
            call.reject("name and data are required");
            return;
        }
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_SNAPSHOT_BYTES) {
            call.reject("snapshot too large");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client
            .open(name, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnCompleteListener(t -> {
                if (!t.isSuccessful() || t.getResult() == null || t.getResult().isConflict()) {
                    call.reject("snapshot open failed");
                    return;
                }
                Snapshot snapshot = t.getResult().getData();
                snapshot.getSnapshotContents().writeBytes(bytes);
                SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription(description).build();
                client.commitAndClose(snapshot, change).addOnCompleteListener(c -> {
                    JSObject r = new JSObject();
                    r.put("available", true);
                    r.put("saved", c.isSuccessful());
                    call.resolve(r);
                });
            });
    }

    /**
     * Reads the cloud save: `found` false (and `data` null) only when there is none yet. Any other failure (no network, a conflict left
     * open, an unreadable file) rejects, so the caller writes nothing over a copy it could not read.
     */
    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        if (refuseIfOff(call)) return;
        String name = call.getString("name");
        if (name == null || name.isEmpty()) {
            call.reject("name is required");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client
            .open(name, false, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnCompleteListener(t -> {
                JSObject r = new JSObject();
                r.put("available", true);
                if (!t.isSuccessful()) {
                    Exception e = t.getException();
                    if (e instanceof ApiException && ((ApiException) e).getStatusCode() == GamesClientStatusCodes.SNAPSHOT_NOT_FOUND) {
                        r.put("data", null);
                        r.put("found", false);
                        call.resolve(r);
                    } else {
                        call.reject("snapshot read failed", e);
                    }
                    return;
                }
                if (t.getResult() == null || t.getResult().isConflict()) {
                    call.reject("snapshot conflict left open");
                    return;
                }
                Snapshot snapshot = t.getResult().getData();
                try {
                    byte[] bytes = snapshot.getSnapshotContents().readFully();
                    r.put("data", new String(bytes, StandardCharsets.UTF_8));
                    r.put("found", true);
                    call.resolve(r);
                } catch (IOException e) {
                    call.reject("snapshot unreadable", e);
                } finally {
                    client.discardAndClose(snapshot);
                }
            });
    }
}
