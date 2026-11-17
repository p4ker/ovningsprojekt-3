#!/usr/bin/env node
// SessionStart: läser in förra passets sessionslogg i agentens kontext.
// Det som skrivs på stdout med kod 0 hamnar i kontexten.
//
// source = startup | resume  -> nytt pass: spara starttid, skriv loggen, påminn vid behov
// source = compact           -> skriv loggen igen, utan påminnelser
// source = clear             -> gör ingenting (/clear körs mellan faserna, inte mellan pass)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sessions = path.join(root, "sessions");
const passStart = path.join(root, ".claude", ".pass-start");
const MARKERING = "Ingen sammanfattning skrevs.";

function lasIndata() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function senasteLogg() {
  if (!existsSync(sessions)) return null;
  const filer = readdirSync(sessions)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-\d+\.md$/.test(f))
    .map((f) => ({ namn: f, tid: statSync(path.join(sessions, f)).mtimeMs }))
    .sort((a, b) => b.tid - a.tid);
  return filer.length > 0 ? filer[0].namn : null;
}

function ocommittadeLoggar() {
  try {
    const ut = execFileSync("git", ["status", "--short", "sessions/"], { cwd: root, encoding: "utf8" });
    return ut.trim().length > 0;
  } catch {
    return false;
  }
}

try {
  const source = lasIndata().source ?? "startup";
  if (source === "clear") process.exit(0);

  const nyttPass = source !== "compact";
  if (nyttPass) writeFileSync(passStart, new Date().toISOString() + "\n");

  const namn = senasteLogg();
  if (!namn) {
    console.log("Det finns ingen tidigare sessionslogg i sessions/. Det här är första passet.");
    process.exit(0);
  }

  const text = readFileSync(path.join(sessions, namn), "utf8");
  console.log(`# Förra passets logg (sessions/${namn})\n`);
  console.log(text.trim());

  if (nyttPass) {
    if (text.includes(MARKERING)) {
      console.log(
        `\nFörra passet saknar sammanfattning. Skriv den först i sessions/${namn}, ` +
          `utifrån faktadelen och git log, och fråga användaren om det som saknas. ` +
          `Ersätt raden "${MARKERING}" och behåll raden som börjar med "Pass:".`,
      );
    }
    if (ocommittadeLoggar()) {
      console.log(
        "\nsessions/ har ändringar som inte är committade. Föreslå en commit av loggen innan nytt arbete börjar.",
      );
    }
  }
} catch (e) {
  // En trasig hook får inte hindra sessionen från att starta.
  console.log(`las-logg kunde inte läsa sessionsloggen: ${e.message}`);
}
process.exit(0);
