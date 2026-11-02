import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
if (!fs.existsSync(manifestPath)) {
  console.error(`AndroidManifest.xml not found: ${manifestPath}`);
  process.exit(1);
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
