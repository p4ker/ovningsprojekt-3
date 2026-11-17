// Gemensam hjälp för hooks som stoppar något: en rad per fångst i sessions/fangster.log.
// Raden har datum, hook, fil och en kort orsak, åtskilda med tabb.
// Själva innehållet som stoppades skrivs aldrig hit, så att en hemlighet inte hamnar i loggen.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

export function loggaFangst(hook, fil, orsak) {
  try {
    const mapp = path.join(root, "sessions");
    mkdirSync(mapp, { recursive: true });
    const rad = [new Date().toISOString(), hook, fil, orsak.replace(/\s+/g, " ")].join("\t");
    appendFileSync(path.join(mapp, "fangster.log"), rad + "\n");
  } catch {
    // Loggen är en mätning. Den får aldrig hindra hooken från att stoppa.
  }
}
