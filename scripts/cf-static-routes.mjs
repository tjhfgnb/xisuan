import { copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const assetsDir = join(dist, "assets");
if (!existsSync(assetsDir)) {
  console.error("[cf-static-routes] missing dist/assets");
  process.exit(1);
}

const files = readdirSync(assetsDir);
const css = files.find((f) => f.endsWith(".css"));
const js = existsSync(join(assetsDir, "spa.js")) ? "spa.js" : undefined;

if (!css || !js) {
  console.error("[cf-static-routes] need a CSS file and assets/spa.js");
  process.exit(1);
}

if (existsSync("public/favicon.svg")) {
  copyFileSync("public/favicon.svg", join(dist, "favicon.svg"));
}

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>析算</title>
    <meta name="description" content="分數計算機：輸入算式，按等於看逐步解算。" />
    <meta name="theme-color" content="#f6f1e8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Outfit:wght@400;500;600&display=swap" />
    <link rel="stylesheet" href="/assets/${css}" />
  </head>
  <body class="antialiased">
    <div id="root"></div>
    <script>
      window.addEventListener("error", function (e) {
        var r = document.getElementById("root");
        if (r && e.message) r.textContent = "載入失敗：" + e.message;
      });
    </script>
    <script type="module" src="/assets/${js}"></script>
  </body>
</html>
`;
writeFileSync(join(dist, "index.html"), html);
writeFileSync(join(dist, "_redirects"), "/*    /index.html   200\n");
console.log(`[cf-static-routes] index.html → /assets/${js} + /assets/${css}`);
