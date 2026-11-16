#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const androidAppDir = path.resolve(rootDir, "android", "app");
const manifestPath = path.resolve(androidAppDir, "src", "main", "AndroidManifest.xml");
const javaDir = path.resolve(androidAppDir, "src", "main", "java", "com", "ikout", "cardgame");
const mainActivityPath = path.resolve(javaDir, "MainActivity.java");
const wsPluginSourcePath = path.resolve(rootDir, "src", "android", "WebSocketServerPlugin.java");
const wsPluginDestPath = path.resolve(javaDir, "ws", "WebSocketServerPlugin.java");

if (!fs.existsSync(manifestPath)) {
  console.log("No Android project found; skipping patch.");
  process.exit(0);
}

// 1. Ensure permissions and hardware acceleration in AndroidManifest.xml
let manifest = fs.readFileSync(manifestPath, "utf-8");

const permissions = [
  "android.permission.CAMERA",
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.ACCESS_WIFI_STATE",
  "android.permission.CHANGE_WIFI_MULTICAST_STATE",
  "android.permission.NEARBY_WIFI_DEVICES",
];

for (const perm of permissions) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(
      "<application",
      `    <uses-permission android:name="${perm}" />\n    <application`,
    );
  }
}

if (!manifest.includes('android:hardwareAccelerated="true"')) {
  manifest = manifest.replace(
    "<application",
    '<application\n        android:hardwareAccelerated="true"',
  );
}

// Ensure the main Activity uses pure overlay soft-input mode so Android never
// resizes or pans the window when the virtual keyboard appears.
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

// 2. Copy WebSocketServerPlugin.java into Android app source tree
if (fs.existsSync(wsPluginSourcePath)) {
  fs.mkdirSync(path.dirname(wsPluginDestPath), { recursive: true });
  fs.copyFileSync(wsPluginSourcePath, wsPluginDestPath);
  console.log("Copied WebSocketServerPlugin.java into the Android project.");
}

// 3. Register WebSocketServerPlugin & Immersive Fullscreen in MainActivity.java
if (fs.existsSync(mainActivityPath)) {
  const replacement = `package com.ikout.cardgame;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.ikout.cardgame.ws.WebSocketServerPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // فرض الاتجاه الأفقي الحقيقي على مستوى النشاط بالكامل (مع دعم التبديل التلقائي بين الاتجاهين الأفقيين)
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

    // السماح بالاستفادة الكاملة من الشاشة العرضية والتعامل مع النوتش بدون قص
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams lp = getWindow().getAttributes();
      lp.layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(lp);
    }

    // يجب التسجيل قبل أن يبني Capacitor الجسر
    registerPlugin(WebSocketServerPlugin.class);
    super.onCreate(savedInstanceState);

    // تطبيق وضع ملء الشاشة الحقيقي وتمديد مساحة الـ WebView لكامل الشاشة
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
   * تفعيل وضع Immersive Fullscreen الحقيقي:
   * 1. منع النظام من قصر الـ Decor/WebView على أشرطة النظام (decorFitsSystemWindows = false).
   * 2. إخفاء أشرطة النظام (Status Bar و Navigation Bar) بصورة تامة أثناء اللعب.
   * 3. تفعيل السحب لإظهار أشرطة النظام مؤقتاً (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE).
   * 4. التوافق المباشر مع جميع إصدارات أندرويد المستهدفة (Android 11+ R و Android 10 وأقدم).
   */
  private void applyImmersiveMode() {
    Window window = getWindow();
    if (window == null) return;

    // تمكين الـ WebView من الاستفادة من كامل المساحة الفيزيائية للشاشة
    WindowCompat.setDecorFitsSystemWindows(window, false);

    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(window, window.getDecorView());
    if (controller != null) {
      controller.hide(WindowInsetsCompat.Type.systemBars());
      controller.setSystemBarsBehavior(
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false);
      WindowInsetsController insetsController = window.getInsetsController();
      if (insetsController != null) {
        insetsController.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        insetsController.setSystemBarsBehavior(
            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else {
      View decorView = window.getDecorView();
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
  fs.writeFileSync(mainActivityPath, replacement, "utf-8");
  console.log("Registered WebSocketServerPlugin in MainActivity.");
}
