import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distUi = join(root, "dist", "ui");
mkdirSync(distUi, { recursive: true });

const chrome = readFileSync(join(root, "locales", "chrome.ko.json"), "utf8");
const skills = readFileSync(join(root, "locales", "skills.ko.json"), "utf8");
const overlay = readFileSync(join(root, "src", "ui", "overlay.js"), "utf8")
  .replaceAll("export function", "function");
const index = readFileSync(join(root, "src", "ui", "index.js"), "utf8")
  .replace('import { getUiLanguage, setUiLanguage, startOverlay } from "./overlay.js";\n', "");

const bundled = [
  "const chromeCatalog = " + chrome + ";",
  "const skillsCatalog = " + skills + ";",
  overlay,
  index,
].join("\n");

writeFileSync(join(distUi, "index.js"), bundled);
copyFileSync(join(root, "locales", "chrome.ko.json"), join(distUi, "chrome.ko.json"));
copyFileSync(join(root, "locales", "skills.ko.json"), join(distUi, "skills.ko.json"));
copyFileSync(join(root, "src", "worker.js"), join(root, "dist", "worker.js"));
copyFileSync(join(root, "src", "manifest.js"), join(root, "dist", "manifest.js"));
console.log("built dist/ui/index.js", bundled.length, "bytes");
