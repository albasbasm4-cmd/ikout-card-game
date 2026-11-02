import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run() {
  const rootDir = process.cwd();
  const apkDir = path.resolve(rootDir, "android/app/build/outputs/apk/debug");

  console.log("=== IKOUT ANDROID APK POST-BUILD AUDITOR ===");

  if (!fs.existsSync(apkDir)) {
    console.error(`FAIL: APK output directory does not exist: ${apkDir}`);
    process.exit(1);
  }

  const apks = fs.readdirSync(apkDir).filter((f) => f.endsWith(".apk"));
  if (apks.length === 0) {
    console.error(`FAIL: No APK files found in ${apkDir}`);
    process.exit(1);
  }

  const apkPath = path.join(apkDir, apks[0]);
  const stats = fs.statSync(apkPath);
  console.log(`Auditing APK: ${apkPath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

  if (stats.size < 10 * 1024 * 1024) {
    console.error(
      `FAIL: APK size is unexpectedly small (${stats.size} bytes). Full game should be > 10MB.`,
    );
    process.exit(1);
  }

  // List files using unzip -l
  const listing = execSync(`unzip -l "${apkPath}"`, { encoding: "utf-8" });
  const lines = listing.split("\n");

  const cardFiles = lines.filter(
    (l) => l.includes("assets/public/assets/ikout/cards/") && /\.(webp|png|svg|jpg)$/i.test(l),
  );
  const unoFiles = lines.filter(
    (l) => l.includes("assets/public/assets/uno/") && l.trim().endsWith(".png"),
  );
  const jsFiles = lines.filter(
    (l) => l.includes("assets/public/assets/") && l.trim().endsWith(".js"),
  );
  const cssFiles = lines.filter(
    (l) => l.includes("assets/public/assets/") && l.trim().endsWith(".css"),
  );
  const audioFiles = lines.filter(
    (l) => l.includes("assets/public/assets/ikout/audio/") && /\.(mp3|wav|ogg)$/i.test(l),
  );
  const indexHtml = lines.find((l) => l.includes("assets/public/index.html"));

  console.log(`Embedded Card Images: ${cardFiles.length}`);
  console.log(`Embedded Uno Images: ${unoFiles.length}`);
  console.log(`Embedded JS Chunks: ${jsFiles.length}`);
  console.log(`Embedded CSS Stylesheets: ${cssFiles.length}`);
  console.log(`Embedded Audio Assets: ${audioFiles.length}`);

  if (!indexHtml) {
    console.error("FAIL: assets/public/index.html missing inside APK!");
    process.exit(1);
  }

  if (cardFiles.length < 338) {
    console.error(`FAIL: APK contains only ${cardFiles.length}/338 card images!`);
    process.exit(1);
  }

  if (unoFiles.length < 56) {
    console.error(`FAIL: APK contains only ${unoFiles.length}/56 Uno images!`);
    process.exit(1);
  }

  if (jsFiles.length < 5) {
    console.error(`FAIL: APK contains only ${jsFiles.length} JavaScript bundles!`);
    process.exit(1);
  }

  if (cssFiles.length < 2) {
    console.error(`FAIL: APK contains only ${cssFiles.length} CSS stylesheets!`);
    process.exit(1);
  }

  if (audioFiles.length < 100) {
    console.error(`FAIL: APK audio assets missing or incomplete (${audioFiles.length} found)!`);
    process.exit(1);
  }

  console.log("PASS: APK asset integrity verification completed with 100% success!");
}

run();
