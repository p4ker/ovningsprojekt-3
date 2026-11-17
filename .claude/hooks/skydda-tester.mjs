#!/usr/bin/env node
// PreToolUse (Edit|Write|Bash): stoppar ändringar som tar bort eller stänger av tester.
// Kod 2 hindrar verktyget från att köras, och stderr skickas till agenten.
//
// Stoppar:
// 1. Testfiler som tas bort, flyttas eller skrivs över från terminalen.
// 2. Tester som stängs av (.skip, .only, xit, xdescribe, pytest.mark.skip).
// 3. Ändringar där antalet tester minskar.
// 4. Ändringar av vilka tester som körs (jest.config.js, pytest.ini).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loggaFangst, root } from "./fangst.mjs";

const HOOK = "skydda-tester";
const REGEL =
  "Tester får ändras men inte tas bort eller stängas av. " +
  "Rätta koden, eller föreslå ändringen av testet för användaren.";

const AVSTANGT =
  /\b(?:it|test|describe)\.(?:skip|only)\b|\bx(?:it|test|describe)\s*\(|@pytest\.mark\.skip(?:if)?\b|\bpytest\.skip\s*\(/g;
const TEST = /\b(?:it|test)(?:\.each\b[^\n]*?)?\s*\(|^\s*def\s+test_\w+/gm;
const URVAL = /\b(?:testMatch|testPathIgnorePatterns|testRegex|testpaths|python_files)\b/;
const TESTVAG = /(?:^|[\s"'=/])tests(?:\/|\s|["']|$)|\.test\.ts\b|\btest_\w+\.py\b/;
const URVALSFIL = /(?:^|[\s"'/])(?:jest\.config\.js|pytest\.ini)\b/;

function lasIndata() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function stoppa(fil, orsak) {
  loggaFangst(HOOK, fil, orsak);
  console.error(`${HOOK}: ${orsak} (${fil}).\n${REGEL}`);
  process.exit(2);
}

const relativ = (filvag) => path.relative(root, path.resolve(root, filvag));
const arTestfil = (fil) => /^tests\//.test(fil) || /\.test\.ts$/.test(fil) || /(^|\/)test_[^/]*\.py$/.test(fil);
const arUrvalsfil = (fil) => fil === "jest.config.js" || fil === "pytest.ini";

// Kommentarer räknas inte, så att ett utkommenterat test räknas som borttaget.
const utanKommentarer = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(?:\/\/|#).*$/gm, "");
const antal = (text, monster) => (utanKommentarer(text).match(monster) ?? []).length;

// Tabelltester: it.each([...]) och @pytest.mark.parametrize("namn", [...]).
// Varje rad i tabellen är ett test, så en borttagen rad räknas som ett borttaget test.
const TABELL = /\b(?:it|test)\.each\s*\(\s*\[|@pytest\.mark\.parametrize\s*\(\s*(["'])[^"'\n]*\1\s*,\s*\[/g;

// Räknar elementen på översta nivån i listan som börjar med "[" på plats start.
function antalElement(text, start) {
  let djup = 0;
  let citat = null;
  let element = 0;
  let harInnehall = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (citat) {
      if (c === "\\") i++;
      else if (c === citat) citat = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      citat = c;
      harInnehall = true;
    } else if ("[({".includes(c)) {
      if (djup > 0) harInnehall = true;
      djup++;
    } else if ("])}".includes(c)) {
      djup--;
      if (djup === 0) return element + (harInnehall ? 1 : 0);
    } else if (c === "," && djup === 1) {
      if (harInnehall) element++;
      harInnehall = false;
    } else if (!/\s/.test(c)) {
      harInnehall = true;
    }
  }
  return element;
}

// Antal tester: varje it(), test() och def test_ är ett, och en tabell med n rader är n.
function antalTester(text) {
  const ren = utanKommentarer(text);
  let summa = (ren.match(TEST) ?? []).length;
  for (const m of ren.matchAll(TABELL)) {
    const rader = antalElement(ren, m.index + m[0].length - 1);
    summa += Math.max(rader, 1) - 1;
  }
  return summa;
}

function kontrolleraTestfil(fil, fore, efter) {
  if (antal(efter, AVSTANGT) > antal(fore, AVSTANGT)) {
    stoppa(fil, "ändringen stänger av ett test (skip, only, xit eller pytest.mark.skip)");
  }
  const fore_n = antalTester(fore);
  const efter_n = antalTester(efter);
  if (efter_n < fore_n) {
    stoppa(fil, `ändringen tar bort tester (${fore_n} före, ${efter_n} efter)`);
  }
}

function kontrolleraFil(fil, fore, efter) {
  if (arUrvalsfil(fil)) {
    const urval = (text) => text.split("\n").filter((rad) => URVAL.test(rad)).join("\n");
    if (urval(fore) !== urval(efter)) stoppa(fil, "ändringen påverkar vilka tester som körs");
  } else if (arTestfil(fil)) {
    kontrolleraTestfil(fil, fore, efter);
  }
}

function kontrolleraKommando(kommando) {
  // Varje del av ett sammansatt kommando bedöms för sig.
  for (const del of kommando.split(/&&|\|\||;|\n/)) {
    const rorTester = TESTVAG.test(del);
    const rorUrval = URVALSFIL.test(del);
    if (!rorTester && !rorUrval) continue;
    const mal = rorTester ? "testfiler" : "testkonfigurationen";

    if (/(?:^|[\s|(])(?:rm|unlink|rmdir|truncate|mv)\s|\bgit\s+(?:rm|mv|clean)\b/.test(del)) {
      stoppa(mal, "kommandot tar bort eller flyttar testfiler");
    }
    const SKYDDAD = String.raw`["']?[^\s"'|]*(?:tests\/|\.test\.ts|test_\w+\.py|jest\.config\.js|pytest\.ini)`;
    const skriverDirekt =
      /\b(?:sed|perl)\b[^|]*\s-[a-zA-Z]*i\b|\bsed\b[^|]*--in-place/.test(del) ||
      new RegExp(String.raw`>>?\s*${SKYDDAD}`).test(del) ||
      new RegExp(String.raw`\btee\s+(?:-a\s+)?${SKYDDAD}`).test(del);
    if (skriverDirekt) {
      stoppa(mal, "kommandot skriver direkt i testfiler. Använd Edit eller Write, så att ändringen kan kontrolleras");
    }
  }
}

const { tool_name: verktyg, tool_input: indata = {} } = lasIndata();

if (verktyg === "Bash" && typeof indata.command === "string") {
  kontrolleraKommando(indata.command);
} else if (verktyg === "Edit" && indata.file_path) {
  const fil = relativ(indata.file_path);
  const gammal = indata.old_string ?? "";
  const ny = indata.new_string ?? "";
  const sokvag = path.join(root, fil);
  const helFil = existsSync(sokvag) ? readFileSync(sokvag, "utf8") : "";
  if (gammal && helFil.includes(gammal)) {
    // Jämför hela filen före och efter, så att en borttagen rad mitt i en tabell syns.
    const efter = indata.replace_all ? helFil.split(gammal).join(ny) : helFil.replace(gammal, () => ny);
    kontrolleraFil(fil, helFil, efter);
  } else {
    kontrolleraFil(fil, gammal, ny);
  }
} else if (verktyg === "Write" && indata.file_path) {
  const fil = relativ(indata.file_path);
  const fore = existsSync(path.join(root, fil)) ? readFileSync(path.join(root, fil), "utf8") : "";
  kontrolleraFil(fil, fore, indata.content ?? "");
}
process.exit(0);
