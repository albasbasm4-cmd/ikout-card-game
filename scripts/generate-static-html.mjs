import fs from "node:fs";
import path from "node:path";

async function run() {
  const targetDir = path.resolve("dist/client");
  fs.mkdirSync(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, "index.html");

  try {
    const ssrPath = path.resolve("node_modules/.nitro/vite/services/ssr/index.js");
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

  const assetsDir = path.join(targetDir, "assets");
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
