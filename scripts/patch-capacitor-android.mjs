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

fs.writeFileSync(manifestPath, manifest, "utf-8");
console.log(
  "Patched AndroidManifest.xml with camera/network permissions and hardware acceleration.",
);
// ---------------- تسجيل الإضافة الأصلية لخادم WebSocket ----------------
// 1) نسخ مصدر الإضافة إلى مشروع الأندرويد
// 2) إضافة اعتماد NanoHTTPD WebSocket إلى build.gradle
// 3) تسجيل الإضافة في MainActivity حتى تتوفر window.Capacitor.Plugins.WebSocketServer
const pluginSrc = path.resolve(process.cwd(), "android-plugin/com/ikout/cardgame/ws/WebSocketServerPlugin.java");
const pluginDestDir = path.resolve(process.cwd(), "android/app/src/main/java/com/ikout/cardgame/ws");
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
    gradle = gradle.replace(
      /dependencies\s*{/,
      `dependencies {\n    ${dep}`,
    );
    fs.writeFileSync(gradlePath, gradle, "utf-8");
    console.log("Added NanoHTTPD WebSocket dependency to app/build.gradle.");
  }
}

const activityPath = path.resolve(process.cwd(), "android/app/src/main/java/com/ikout/cardgame/MainActivity.java");
if (fs.existsSync(activityPath)) {
  const mainActivity = `package com.ikout.cardgame;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.ikout.cardgame.ws.WebSocketServerPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(WebSocketServerPlugin.class);
  }
}
`;
  fs.writeFileSync(activityPath, mainActivity, "utf-8");
  console.log("Registered WebSocketServerPlugin in MainActivity.");
}

