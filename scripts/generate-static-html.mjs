import fs from "node:fs";
import path from "node:path";

async function run() {
  const rootDir = process.cwd();
  const outputPublic = path.resolve(rootDir, ".output/public");
  const distClient = path.resolve(rootDir, "dist/client");

  // In non-sandbox production builds, Nitro places client assets in .output/public.
  // Capacitor expects the complete web app in dist/client.
  // Copy all assets, JS/CSS bundles, media, and fonts over to dist/client.
  if (fs.existsSync(outputPublic)) {
    console.log(`Copying full client production assets from ${outputPublic} to ${distClient}...`);
    fs.mkdirSync(distClient, { recursive: true });
    fs.cpSync(outputPublic, distClient, { recursive: true });
  }

  fs.mkdirSync(distClient, { recursive: true });
  const targetFile = path.join(distClient, "index.html");

  try {
    const ssrPath = path.resolve(rootDir, "node_modules/.nitro/vite/services/ssr/index.js");
    if (fs.existsSync(ssrPath)) {
      const ssrModule = await import(ssrPath);
      const server = ssrModule.default;
      const req = new Request("http://localhost/");
      const res = await server.fetch(req, {}, {});
      if (res.status === 200) {
        const html = await res.text();
        fs.writeFileSync(targetFile, html, "utf-8");
        console.log("Successfully generated dist/client/index.html with pre-rendered SSR shell!");
        return;
      }
    }
  } catch (err) {
    console.warn("Failed SSR pre-render fallback:", err);
  }

  const assetsDir = path.join(distClient, "assets");
  let indexJs = "";
  let stylesCss = "";
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    indexJs = files.find(f => f.startsWith("index-") && f.endsWith(".js")) || "";
    stylesCss = files.find(f => f.startsWith("styles-") && f.endsWith(".css")) || "";
  }
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#072a1e" />
  <title>iKout - كوت بوستة</title>
  ${stylesCss ? `<link rel="stylesheet" href="/assets/${stylesCss}" />` : ''}
</head>
<body class="select-none antialiased overflow-hidden">
  <div id="root"></div>
  ${indexJs ? `<script type="module" src="/assets/${indexJs}"></script>` : ''}
</body>
</html>`;
  fs.writeFileSync(targetFile, html, "utf-8");
  console.log("Generated fallback dist/client/index.html");
}

run();
