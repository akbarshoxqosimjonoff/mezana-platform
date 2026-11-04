import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const pnpmDir = path.join(rootDir, "node_modules/.pnpm");
const esbuildPkg = fs.readdirSync(pnpmDir).find((d) => d.startsWith("esbuild@"));
if (!esbuildPkg) throw new Error("esbuild package not found in node_modules/.pnpm");
const req = createRequire(path.join(pnpmDir, esbuildPkg, "node_modules/esbuild/package.json"));
const esbuild = req(".");

const distDir = path.join(__dirname, "dist");
fs.mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(__dirname, "src/App.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  outfile: path.join(distDir, "app.js"),
  nodePaths: [
    path.join(rootDir, "apps/web/node_modules"),
    path.join(rootDir, "node_modules"),
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

const pubStyles = path.join(__dirname, "public/styles.css");
if (fs.existsSync(pubStyles)) {
  fs.copyFileSync(pubStyles, path.join(distDir, "styles.css"));
}
const pubLogo = path.join(__dirname, "public/ezan-logo.svg");
if (fs.existsSync(pubLogo)) {
  fs.copyFileSync(pubLogo, path.join(distDir, "ezan-logo.svg"));
}

const ts = Math.floor(Date.now() / 1000);
const html = `<!DOCTYPE html>
<html lang="uz" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mezana ? Yagona Boshqaruv Tizimi</title>
    <link rel="stylesheet" href="/styles.css?v=${ts}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app.js?v=${ts}"></script>
  </body>
</html>
`;
fs.writeFileSync(path.join(distDir, "index.html"), html, "utf8");
console.log("[apps/finance] Built dist/app.js and dist/index.html successfully");
