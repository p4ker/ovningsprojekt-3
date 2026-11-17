#!/usr/bin/env node
// PreToolUse (Edit|Write): stoppar hemligheter i koden och skrivningar till .env.
// Kod 2 hindrar verktyget från att köras, och stderr skickas till agenten.
//
// Stoppar:
// 1. Skrivningar till .env och .env.* (utom .env.example).
// 2. Nycklar i kända format (sk-, ghp_, AKIA, privata nycklar).
// 3. Tilldelningar där namnet låter som en hemlighet och värdet står direkt i koden.
// 4. URL:er med inloggningsuppgifter till andra värdar än den egna datorn.
//
// Bara nya förekomster stoppas. Det som redan står i filen får stå kvar, annars
// skulle varje ändring nära en gammal rad stoppas. Hemligheten skrivs aldrig i loggen.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loggaFangst, root } from "./fangst.mjs";

const HOOK = "skydda-hemligheter";
const DENNA_FIL = ".claude/hooks/skydda-hemligheter.mjs";
const LOKALA_VARDAR = new Set(["localhost", "127.0.0.1", "[::1]"]);

const KANDA_FORMAT = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "nyckel i känt format (sk-)"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "nyckel i känt format (GitHub)"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "nyckel i känt format (GitHub)"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "nyckel i känt format (AWS)"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "nyckel i känt format (Slack)"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "privat nyckel"],
];

// namn = "värde", namn: 'värde' och liknande, där värdet står direkt i koden.
const TILLDELNING =
  /([\w$]*(?:password|passwd|secret|token|api[_-]?key|l[oö]senord)[\w$]*)["']?\s*[:=]\s*(["'`])([^"'`\n]{4,})\2/gi;

const URL_MED_UPPGIFTER = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/"'`]+:[^\s@/"'`]+@(\[[^\]]+\]|[^\s/:"'`@]+)/gi;

function lasIndata() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function stoppa(fil, orsaker) {
  const unika = [...new Set(orsaker)];
  loggaFangst(HOOK, fil, unika.join(", "));
  console.error(
    [
      `${HOOK}: ändringen i ${fil} stoppades: ${unika.join(", ")}.`,
      "Hemligheter får inte stå i koden (docs/standard.md: Hemligheter och loggar).",
      "Läs värdet från en miljövariabel (process.env.NAMN eller os.environ) och lägg det i .env, som inte committas.",
      "Agenten får inte skriva i .env. Be användaren lägga in värdet där.",
    ].join("\n"),
  );
  process.exit(2);
}

// Hittar hemligheter i texten och returnerar [träff, orsak]. Träffen används bara
// för att jämföra med det som redan stod i filen och skrivs aldrig ut.
function hitta(text) {
  const fynd = [];
  for (const [monster, orsak] of KANDA_FORMAT) {
    for (const m of text.matchAll(monster)) fynd.push([m[0], orsak]);
  }
  for (const m of text.matchAll(TILLDELNING)) {
    const [hela, namn, , varde] = m;
    if (varde.includes("${")) continue; // sätts ihop av andra värden, inte en fast hemlighet
    fynd.push([hela, `hemlighet direkt i koden (${namn})`]);
  }
  for (const m of text.matchAll(URL_MED_UPPGIFTER)) {
    const vard = m[1].toLowerCase();
    if (!LOKALA_VARDAR.has(vard)) fynd.push([m[0], `URL med inloggningsuppgifter till ${vard}`]);
  }
  return fynd;
}

const { tool_name: verktyg, tool_input: indata = {} } = lasIndata();
if (!indata.file_path || (verktyg !== "Edit" && verktyg !== "Write")) process.exit(0);

const fil = path.relative(root, path.resolve(root, indata.file_path));
const namn = path.basename(fil);

if (/^\.env(\..+)?$/.test(namn) && namn !== ".env.example") {
  stoppa(fil, ["skrivning till .env"]);
}
if (fil === DENNA_FIL) process.exit(0); // filen innehåller mönstren

let fore = "";
let efter = "";
if (verktyg === "Edit") {
  fore = indata.old_string ?? "";
  efter = indata.new_string ?? "";
} else {
  const sokvag = path.join(root, fil);
  fore = existsSync(sokvag) ? readFileSync(sokvag, "utf8") : "";
  efter = indata.content ?? "";
}

const nya = hitta(efter).filter(([traff]) => !fore.includes(traff));
if (nya.length > 0) stoppa(fil, nya.map(([, orsak]) => orsak));
process.exit(0);
