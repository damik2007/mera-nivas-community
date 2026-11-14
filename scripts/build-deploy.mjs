// Builds everything you need to upload to Namecheap into the ./deploy folder.
//   deploy/frontend  ->  upload into public_html/mycommunity/
//   deploy/api       ->  upload into ~/mycommunity-api/  (the Node.js app)
// Run with:  npm run build:deploy
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps", "web");
const out = path.join(root, "deploy");
const SUBFOLDER = "mycommunity"; // must match `base` in apps/web/vite.config.ts

// ---- 0. Show which API address the frontend will be built against ----------
const envFile = path.join(webDir, ".env.production");
if (!existsSync(envFile)) {
  console.error("Missing apps/web/.env.production (it should contain VITE_API_URL=https://api.yourdomain.com)");
  process.exit(1);
}
const apiUrl = /^VITE_API_URL=(.+)$/m.exec(readFileSync(envFile, "utf8"))?.[1]?.trim();
console.log(`\n==> Frontend will talk to the API at: ${apiUrl}`);
console.log("    (wrong? edit apps/web/.env.production and run this again)\n");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---- 1. Frontend (React) ---------------------------------------------------
// Uses `vite build` directly so a stray TypeScript warning can't block a deploy.
console.log("==> Building the frontend...");
const vite = spawnSync("npx", ["vite", "build"], { cwd: webDir, stdio: "inherit", shell: true });
if (vite.status !== 0) {
  console.error("\nFrontend build failed - see the error above.");
  process.exit(1);
}
cpSync(path.join(webDir, "dist"), path.join(out, "frontend"), { recursive: true });

// Makes /mycommunity/events, /mycommunity/login etc. work on refresh.
writeFileSync(
  path.join(out, "frontend", ".htaccess"),
  `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /${SUBFOLDER}/
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /${SUBFOLDER}/index.html [L]
</IfModule>
`
);

// ---- 2. API (Node.js) -> one self-contained file ---------------------------
// esbuild inlines the API, the packages/* workspaces and every npm dependency into
// a single app.js, so the server needs no `npm install` at all.
console.log("\n==> Bundling the API into a single file...");
await build({
  entryPoints: [path.join(root, "apps", "api", "src", "index.ts")],
  outfile: path.join(out, "api", "app.js"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["bufferutil", "utf-8-validate"], // optional native speed-ups for websockets
  logLevel: "warning",
});
writeFileSync(
  path.join(out, "api", "package.json"),
  JSON.stringify({ name: "mycommunity-api", version: "1.0.0", private: true, main: "app.js" }, null, 2) + "\n"
);

console.log(`
==> Done. Your upload folders are ready in: ${out}

    deploy/frontend  ->  upload the CONTENTS into  public_html/${SUBFOLDER}/
    deploy/api       ->  upload the CONTENTS into  mycommunity-api/   (next to public_html, NOT inside it)

    Follow DEPLOY-NAMECHEAP.md for the click-by-click steps.
`);
