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

for (const pubFile of ["styles.css", "ezan-logo.svg"]) {
  const srcPath = path.join(__dirname, "public", pubFile);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(distDir, pubFile));
  }
}

const ts = Math.floor(Date.now() / 1000);
const html = `<!DOCTYPE html>
<html lang="uz" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ezan Vakf? ? Vaqf Mulk va Inventarizatsiya Tizimi</title>
    <link rel="stylesheet" href="/vaqf/styles.css?v=${ts}" />
    <link rel="icon" type="image/svg+xml" href="/vaqf/ezan-logo.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/vaqf/app.js?v=${ts}"></script>
  </body>
</html>
`;
fs.writeFileSync(path.join(distDir, "index.html"), html, "utf8");
console.log("[apps/vaqf] Built dist/app.js and dist/index.html successfully");
