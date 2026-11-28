package com.bulssistudio.meowguard;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Google Play In-App Updates (docs: developer.android.com/guide/playcore/in-app-updates; app-update 2.1.0), the check only: the
 * title asks whether Play has a newer version of the game for this player (a tester sees the newest build of their own track) and
 * sends the player to the store page. An app not installed from Play, or a failed check, answers "no update".
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    @PluginMethod
    public void check(PluginCall call) {
        AppUpdateManagerFactory.create(getContext())
            .getAppUpdateInfo()
            .addOnCompleteListener(task -> {
                JSObject r = new JSObject();
                r.put("available", task.isSuccessful()
                    && task.getResult().updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE);
                call.resolve(r);
            });
    }

    /** The game's page in the Play Store app, or on the web where the Play Store app is missing. */
    @PluginMethod
    public void openStore(PluginCall call) {
        String id = getContext().getPackageName();
        try {
            startView("market://details?id=" + id);
        } catch (ActivityNotFoundException e) {
            startView("https://play.google.com/store/apps/details?id=" + id);
        }
        call.resolve();
    }

    private void startView(String uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
