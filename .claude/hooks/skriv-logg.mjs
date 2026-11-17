#!/usr/bin/env node
// SessionEnd och PreCompact: skriver fakta om läget i passets sessionslogg.
// Agenten skriver sammanfattningen med /sessionslogg. Den här hooken lägger till
// det som går att kontrollera: branch, commits, ändrade filer och testresultat.
//
// Passets logg känns igen på raden "Pass: <starttid>", där starttiden kommer från
// .claude/.pass-start (skriven av las-logg). Finns ingen logg skapas en med bara fakta.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sessions = path.join(root, "sessions");
const passStartFil = path.join(root, ".claude", ".pass-start");
const fangster = path.join(sessions, "fangster.log");
const MARKERING = "Ingen sammanfattning skrevs.";
const RUBRIK = "## Fakta (skriven av hook)";

// Den virtuella Python-miljön och projektets egna verktyg ska hittas även när
// sessionen startades utan att .venv var aktiverad.
const env = {
  ...process.env,
  PATH: [path.join(root, ".venv", "bin"), path.join(root, "node_modules", ".bin"), process.env.PATH].join(
    path.delimiter,
  ),
};

function lasIndata() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function kor(kommando, argument, timeout = 10_000) {
  const r = spawnSync(kommando, argument, { cwd: root, env, encoding: "utf8", timeout });
  return { status: r.status, ut: `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim() };
}

function rader(text) {
  return text.split("\n").map((r) => r.trimEnd()).filter(Boolean);
}

function jestResultat() {
  const r = kor("npm", ["test", "--silent"], 40_000);
  const rad = r.ut.match(/^Tests:\s+(.+)$/m);
  return rad ? rad[1] : "kunde inte köras (är databasen igång?)";
}

function pytestResultat() {
  const r = kor("npm", ["run", "--silent", "test:legacy"], 15_000);
  const sista = rader(r.ut).at(-1) ?? "";
  return /passed|failed|error|no tests ran/.test(sista)
    ? sista.replace(/=+/g, "").trim()
    : "kunde inte köras (är .venv installerad?)";
}

function fangsterSedan(start) {
  if (!existsSync(fangster)) return 0;
  return rader(readFileSync(fangster, "utf8")).filter((r) => !start || r.split("\t")[0] >= start).length;
}

function passetsLogg(start) {
  const filer = readdirSync(sessions).filter((f) => /^\d{4}-\d{2}-\d{2}-\d+\.md$/.test(f));
  if (start) {
    const medStampel = filer.find((f) => readFileSync(path.join(sessions, f), "utf8").includes(`Pass: ${start}`));
    if (medStampel) return medStampel;
  }
  // Reserv: en logg som skrevs under passet men saknar raden "Pass:".
  const startMs = start ? Date.parse(start) : Date.now();
  return (
    filer.find((f) => {
      const fil = path.join(sessions, f);
      return statSync(fil).mtimeMs > startMs && !/^Pass: /m.test(readFileSync(fil, "utf8"));
    }) ?? null
  );
}

function nyttFilnamn() {
  const datum = new Date().toLocaleDateString("sv-SE");
  const nummer = readdirSync(sessions).filter((f) => f.startsWith(datum)).length + 1;
  return { namn: `${datum}-${nummer}.md`, datum, nummer };
}

function medFakta(text, fakta) {
  const i = text.indexOf(RUBRIK);
  if (i === -1) return `${text.trimEnd()}\n\n${fakta}\n`;
  const nasta = text.indexOf("\n## ", i + RUBRIK.length);
  const efter = nasta === -1 ? "" : `\n${text.slice(nasta).trimStart()}`;
  return `${text.slice(0, i)}${fakta}\n${efter}`;
}

try {
  const indata = lasIndata();
  const handelse = indata.hook_event_name ?? "SessionEnd";
  // /clear avslutar sessionen tekniskt sett, men passet fortsätter.
  if (handelse === "SessionEnd" && indata.reason === "clear") process.exit(0);

  mkdirSync(sessions, { recursive: true });
  const start = existsSync(passStartFil) ? readFileSync(passStartFil, "utf8").trim() : null;

  const commits = start
    ? rader(kor("git", ["log", `--since=${start}`, "--pretty=format:%h %s"]).ut)
    : [];
  const andrade = rader(kor("git", ["status", "--short"]).ut);
  const lista = (r) => (r.length > 0 ? `\n${r.map((x) => `  - \`${x.trim()}\``).join("\n")}` : " inga");

  const fakta = [
    RUBRIK,
    "",
    `- Skriven: ${new Date().toLocaleString("sv-SE")} (${handelse})`,
    `- Branch: ${kor("git", ["rev-parse", "--abbrev-ref", "HEAD"]).ut || "okänd"}`,
    `- Commits under passet:${lista(commits)}`,
    `- Ändringar som inte är committade:${lista(andrade)}`,
    `- npm test: ${jestResultat()}`,
    `- npm run test:legacy: ${pytestResultat()}`,
    `- Stoppade av hooks under passet: ${fangsterSedan(start)} (se sessions/fangster.log)`,
  ].join("\n");

  const befintlig = passetsLogg(start);
  if (befintlig) {
    const fil = path.join(sessions, befintlig);
    let text = readFileSync(fil, "utf8");
    if (start && !text.includes(`Pass: ${start}`)) {
      text = text.replace(/^(# .*\n)/, `$1\nPass: ${start}\n`);
    }
    writeFileSync(fil, medFakta(text, fakta));
  } else {
    const { namn, datum, nummer } = nyttFilnamn();
    const huvud = [
      `# Sessionslogg ${datum}, pass ${nummer}`,
      "",
      `Pass: ${start ?? "okänd starttid"}`,
      "",
      MARKERING,
      "",
    ].join("\n");
    writeFileSync(path.join(sessions, namn), `${huvud}\n${fakta}\n`);
  }
} catch (e) {
  // En trasig hook får inte hindra sessionen från att avslutas.
  console.error(`skriv-logg misslyckades: ${e.message}`);
}
process.exit(0);
