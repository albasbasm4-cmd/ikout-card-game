import fs from "node:fs";
import path from "node:path";

function run() {
  const rootDir = process.cwd();
  const distClient = path.resolve(rootDir, "dist/client");
  const androidPublic = path.resolve(rootDir, "android/app/src/main/assets/public");

  console.log("=== IKOUT ANDROID ASSET INTEGRITY AUDITOR ===");

  const targetDir = fs.existsSync(androidPublic) ? androidPublic : distClient;
  console.log(`Inspecting target asset directory: ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    console.error(`FAIL: Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  // 1. Check index.html
  const indexHtml = path.join(targetDir, "index.html");
  if (!fs.existsSync(indexHtml) || fs.statSync(indexHtml).size < 200) {
    console.error(`FAIL: index.html is missing or empty in ${targetDir}`);
    process.exit(1);
  }
  console.log(`PASS: index.html verified (${fs.statSync(indexHtml).size} bytes)`);

  // 2. Check JavaScript & CSS bundles in assets/
  const assetsDir = path.join(targetDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    console.error(`FAIL: assets directory missing in ${targetDir}`);
    process.exit(1);
  }
  const assetFiles = fs.readdirSync(assetsDir);
  const jsBundles = assetFiles.filter((f) => f.endsWith(".js"));
  const cssBundles = assetFiles.filter((f) => f.endsWith(".css"));

  console.log(`Found ${jsBundles.length} JS bundles and ${cssBundles.length} CSS stylesheets.`);
  if (jsBundles.length < 5) {
    console.error(`FAIL: Expected multiple JS production chunks, found only ${jsBundles.length}`);
    process.exit(1);
  }
  if (cssBundles.length < 2) {
    console.error(`FAIL: Expected CSS stylesheets, found only ${cssBundles.length}`);
    process.exit(1);
  }
  console.log("PASS: JS and CSS production bundles verified.");

  // 3. Check Card Assets (all 338 production card files)
  const cardsDir = path.join(targetDir, "assets/ikout/cards");
  if (!fs.existsSync(cardsDir)) {
    console.error(`FAIL: Cards directory missing: ${cardsDir}`);
    process.exit(1);
  }

  let cardCount = 0;
  function countCards(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        countCards(full);
      } else if (/\.(webp|png|svg|jpg)$/i.test(e.name)) {
        cardCount++;
      }
    }
  }
  countCards(cardsDir);
  console.log(`Found ${cardCount} production card images in ${cardsDir}.`);
  if (cardCount < 338) {
    console.error(`FAIL: Expected 338 card images, found only ${cardCount}`);
    process.exit(1);
  }
  console.log("PASS: 338 card assets verified.");

  // 4. Check Uno Card Assets (56 verified files)
  const unoDir = path.join(targetDir, "assets/uno");
  if (!fs.existsSync(unoDir)) {
    console.error(`FAIL: Uno directory missing: ${unoDir}`);
    process.exit(1);
  }
  const unoFiles = fs.readdirSync(unoDir).filter((f) => f.endsWith(".png"));
  console.log(`Found ${unoFiles.length} Uno local images in ${unoDir}.`);
  if (unoFiles.length < 56) {
    console.error(`FAIL: Expected 56 Uno images, found only ${unoFiles.length}`);
    process.exit(1);
  }
  console.log("PASS: 56 Uno card assets verified.");

  // 5. Check Audio Assets
  const audioDir = path.join(targetDir, "assets/ikout/audio");
  if (!fs.existsSync(audioDir)) {
    console.error(`FAIL: Audio directory missing: ${audioDir}`);
    process.exit(1);
  }

  let audioCount = 0;
  function countAudio(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        countAudio(full);
      } else if (/\.(mp3|wav|ogg)$/i.test(e.name)) {
        audioCount++;
      }
    }
  }
  countAudio(audioDir);
  console.log(`Found ${audioCount} audio files in ${audioDir}.`);
  if (audioCount < 100) {
    console.error(`FAIL: Audio assets missing or incomplete (${audioCount} found)`);
    process.exit(1);
  }
  console.log("PASS: Audio assets verified.");

  console.log("=== ALL INTEGRITY CHECKS PASSED SUCCESSFULLY ===");
}

run();
