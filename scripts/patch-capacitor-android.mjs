import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
if (!fs.existsSync(manifestPath)) {
  console.warn(
    `WARN: AndroidManifest.xml not found at ${manifestPath}. ` +
      "لم يتم إنشاء مشروع أندرويد بعد (شغّل npx cap add android أولاً) — تم تخطي إصلاح الأندرويد.",
  );
  process.exit(0);
}

let manifest = fs.readFileSync(manifestPath, "utf-8");
const requiredEntries = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
  '<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
];

for (const entry of requiredEntries) {
  if (!manifest.includes(entry))
    manifest = manifest.replace("</manifest>", `    ${entry}\n</manifest>`);
}

if (manifest.includes("<application") && !manifest.includes('android:hardwareAccelerated="true"')) {
  manifest = manifest.replace("<application", '<application android:hardwareAccelerated="true"');
}
if (
  manifest.includes("<application") &&
  !manifest.includes('android:usesCleartextTraffic="true"')
) {
  manifest = manifest.replace("<application", '<application android:usesCleartextTraffic="true"');
}

if (manifest.includes('android:windowSoftInputMode="adjustResize"')) {
  manifest = manifest.replace(
    'android:windowSoftInputMode="adjustResize"',
    'android:windowSoftInputMode="adjustNothing"',
  );
} else if (manifest.includes('android:windowSoftInputMode="adjustPan"')) {
  manifest = manifest.replace(
    'android:windowSoftInputMode="adjustPan"',
    'android:windowSoftInputMode="adjustNothing"',
  );
}
fs.writeFileSync(manifestPath, manifest, "utf-8");
console.log(
  "Patched AndroidManifest.xml with camera/network permissions and hardware acceleration.",
);
// ---------------- تسجيل الإضافة الأصلية لخادم WebSocket ----------------
// 1) نسخ مصدر الإضافة إلى مشروع الأندرويد
// 2) إضافة اعتماد NanoHTTPD WebSocket إلى build.gradle
// 3) تسجيل الإضافة في MainActivity حتى تتوفر window.Capacitor.Plugins.WebSocketServer
const pluginSrc = path.resolve(
  process.cwd(),
  "android-plugin/com/ikout/cardgame/ws/WebSocketServerPlugin.java",
);
const pluginDestDir = path.resolve(
  process.cwd(),
  "android/app/src/main/java/com/ikout/cardgame/ws",
);
const pluginDest = path.join(pluginDestDir, "WebSocketServerPlugin.java");

if (fs.existsSync(pluginSrc)) {
  fs.mkdirSync(pluginDestDir, { recursive: true });
  fs.copyFileSync(pluginSrc, pluginDest);
  console.log("Copied WebSocketServerPlugin.java into the Android project.");
} else {
  console.warn(`Plugin source not found: ${pluginSrc}`);
}

const gradlePath = path.resolve(process.cwd(), "android/app/build.gradle");
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, "utf-8");
  const dep = "implementation 'org.nanohttpd:nanohttpd-websocket:2.3.1'";
  if (!gradle.includes("nanohttpd")) {
    gradle = gradle.replace(/dependencies\s*{/, `dependencies {\n    ${dep}`);
    fs.writeFileSync(gradlePath, gradle, "utf-8");
    console.log("Added NanoHTTPD WebSocket dependency to app/build.gradle.");
  }
}

const activityPath = path.resolve(
  process.cwd(),
  "android/app/src/main/java/com/ikout/cardgame/MainActivity.java",
);
if (fs.existsSync(activityPath)) {
  const mainActivity = `package com.ikout.cardgame;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.ikout.cardgame.ws.WebSocketServerPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // فرض الاتجاه الأفقي الحقيقي على مستوى النشاط بالكامل (مع دعم التبديل التلقائي بين الاتجاهين الأفقيين)
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

    // السماح بالاستفادة الكاملة من الشاشة العرضية والتعامل مع النوتش بدون قص
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      getWindow().getAttributes().layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }

    // يجب التسجيل قبل أن يبني Capacitor الجسر
    registerPlugin(WebSocketServerPlugin.class);
    super.onCreate(savedInstanceState);

    // تطبيق وضع ملء الشاشة الحقيقي (Immersive Fullscreen)
    applyImmersiveMode();

    // السماح باتصال ws:// المحلي من صفحة https://localhost
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().getSettings()
          .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    // تأكيد الاتجاه الأفقي الحقيقي للنشاط عند العودة للتطبيق
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    // إعادة تطبيق وضع ملء الشاشة عند استعادة النشاط
    applyImmersiveMode();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    // إعادة تطبيق وضع ملء الشاشة عند استعادة نافذة التطبيق للتركيز
    if (hasFocus) {
      applyImmersiveMode();
    }
  }

  /**
   * تفعيل وضع Immersive Fullscreen لإخفاء شريط الحالة وشريط التنقل
   * مع السماح بإظهارهما مؤقتاً بالسحب (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE / IMMERSIVE_STICKY).
   */
  private void applyImmersiveMode() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController insetsController = getWindow().getInsetsController();
      if (insetsController != null) {
        insetsController.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        insetsController.setSystemBarsBehavior(
            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else {
      View decorView = getWindow().getDecorView();
      if (decorView != null) {
        int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN;
        decorView.setSystemUiVisibility(flags);
      }
    }
  }
}
`;
  fs.writeFileSync(activityPath, mainActivity, "utf-8");
  console.log("Registered WebSocketServerPlugin in MainActivity.");
}
