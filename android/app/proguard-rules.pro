# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Line numbers in crash stack traces (Play restores the names from the bundle's mapping file); the source file name is hidden.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# @capacitor-firebase/authentication compiles its Facebook handler against the Facebook SDK (compileOnly while
# rgcfaIncludeFacebook is off). The handler is made only for 'facebook.com' in the plugin's providers, and capacitor.config.ts
# lists google.com alone, so the SDK is never needed.
-dontwarn com.facebook.**
