import fs from "node:fs";
import path from "node:path";

const repoRoot = "C:/Users/sinmb/ClawTavern-Portal";
const agentwarRoot = path.join(repoRoot, "agentwar");

const requiredFiles = [
  "index.html",
  "factions.html",
  "battles.html",
  "guide.html",
  "profile.html",
  "ranking.html",
  "map.html",
  "js/i18n.js",
  "js/shared.js",
];

const koreanPattern = /[가-힣]/;
const badHtmlFragments = [
  "AGENT WAR ?",
  "?? Watch the War",
  "?? Join as Agent",
  "??Guide",
  "??/span",
  "¡¤",
  "¢º",
  "징짚",
  "짢횕",
  "짖쨘",
  "��",
];
const legacyLocaleMarkupPattern = /(>EN<|>KO<|data-locale-toggle|agentwar-lang-toggle)/;
const requiredScopedAssets = [
  "./assets/ui-accept-quest.webp",
  "./assets/ui-faction-wars.webp",
  "./assets/ui-leaderboard.webp",
  "./assets/faction-forge-character.webp",
  "./assets/faction-oracle-character.webp",
  "./assets/faction-void-character.webp",
];
const legacySharedAssetPathPattern = /(?:\.\.\/images\/agentwar\/|\.\.\/images\/bg-)/;
const requiredAssetFiles = [
  "assets/ui-accept-quest.webp",
  "assets/ui-faction-wars.webp",
  "assets/ui-leaderboard.webp",
  "assets/faction-forge-character.webp",
  "assets/faction-oracle-character.webp",
  "assets/faction-void-character.webp",
  "assets/class-mage-avatar.webp",
  "assets/faction-forge-emblem.webp",
  "assets/faction-oracle-emblem.webp",
  "assets/faction-void-emblem.webp",
  "assets/bg-battle.png",
  "assets/bg-faction-select.png",
  "assets/bg-guide.png",
  "assets/bg-leaderboard.png",
  "assets/bg-profile.png",
  "assets/bg-warmap.png",
];

const issues = [];

function read(relativePath) {
  const fullPath = path.join(agentwarRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    issues.push(`Missing required file: agentwar/${relativePath}`);
    return "";
  }

  return fs.readFileSync(fullPath, "utf8");
}

for (const relativePath of requiredFiles) {
  const source = read(relativePath);
  if (!source) continue;

  if (koreanPattern.test(source)) {
    issues.push(`Korean text remains in agentwar/${relativePath}`);
  }

  if (relativePath.endsWith(".html")) {
    if (legacyLocaleMarkupPattern.test(source)) {
      issues.push(`Legacy EN/KO toggle markup remains in agentwar/${relativePath}`);
    }

    for (const fragment of badHtmlFragments) {
      if (source.includes(fragment)) {
        issues.push(`Broken glyph fragment "${fragment}" remains in agentwar/${relativePath}`);
      }
    }
  }

  if (legacySharedAssetPathPattern.test(source)) {
    issues.push(`Legacy root image paths remain in agentwar/${relativePath}`);
  }
}

const guide = read("guide.html");
if (guide && !guide.includes("How the war works")) {
  issues.push("guide.html is missing the rebuilt English guide content");
}

const indexHtml = read("index.html");
for (const assetPath of requiredScopedAssets) {
  if (!indexHtml.includes(assetPath)) {
    issues.push(`index.html is missing scoped asset path ${assetPath}`);
  }
}

for (const relativePath of requiredAssetFiles) {
  const fullPath = path.join(agentwarRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    issues.push(`Missing required asset file: agentwar/${relativePath}`);
  }
}

const shared = read("js/shared.js");
if (shared) {
  if (!shared.includes("agentwar.ail.profile")) {
    issues.push("shared.js does not persist linked Agent ID Card profile state");
  }

  if (!shared.includes("showAgentLinkModal")) {
    issues.push("shared.js does not expose an Agent ID Card continuation modal");
  }

  if (!shared.includes("agentidcard:linked")) {
    issues.push("shared.js does not listen for Agent ID Card postMessage callbacks");
  }

  if (!shared.includes("agentwar.join.selection")) {
    issues.push("shared.js does not persist the selected arena and faction");
  }
}

const i18n = read("js/i18n.js");
if (i18n && !i18n.includes('return "en";')) {
  issues.push("i18n.js no longer forces the English locale");
}

if (issues.length > 0) {
  console.error("Agent War portal checks failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Agent War portal checks passed.");
