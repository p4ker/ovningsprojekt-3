#!/usr/bin/env node
// PostToolUse (Edit|Write): formaterar filen och kontrollerar den mot kodstandarden.
// Ändringen är redan gjord när hooken körs. Vid fel avslutar den med kod 2, och det
// som skrivs på stderr skickas till agenten så att den rättar själv.
//
// - Prettier och ESLint körs på filen som ändrades.
// - tsc körs bara för filer under src/ och scripts/. Ett rött test får anropa något
//   som inte finns än, så typfel i tests/ rapporteras inte här.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loggaFangst, root } from "./fangst.mjs";

const HOOK = "kontrollera-kodstandard";
const bin = (namn) => path.join(root, "node_modules", ".bin", namn);

function lasIndata() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function kor(kommando, argument) {
  const r = spawnSync(kommando, argument, { cwd: root, encoding: "utf8", timeout: 60_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const filvag = lasIndata().tool_input?.file_path;
if (!filvag) process.exit(0);

const fil = path.relative(root, path.resolve(root, filvag));
const arKod = /^(src|tests|scripts)\//.test(fil) && fil.endsWith(".ts");
if (!arKod || !existsSync(path.join(root, fil))) process.exit(0);

const fel = [];
const orsaker = [];

// 1. Formatering. Prettier skriver om filen och misslyckas bara om den inte går att tolka.
const prettier = kor(bin("prettier"), ["--write", fil]);
if (prettier.status !== 0) {
  fel.push(`Prettier kunde inte tolka filen:\n${prettier.stderr.trim()}`);
  orsaker.push("prettier: syntaxfel");
}

// 2. Lint, med projektets egna regler ur docs/standard.md.
const eslint = kor(bin("eslint"), ["--format", "json", fil]);
try {
  for (const resultat of JSON.parse(eslint.stdout)) {
    for (const m of resultat.messages.filter((x) => x.severity === 2)) {
      fel.push(`${fil}:${m.line}:${m.column} ${m.message} (${m.ruleId ?? "syntax"})`);
      orsaker.push(`eslint: ${m.ruleId ?? "syntax"}`);
    }
  }
} catch {
  if (eslint.status !== 0) {
    fel.push(`ESLint kunde inte köras:\n${eslint.stderr.trim()}`);
    orsaker.push("eslint: kunde inte köras");
  }
}

// 3. Typer, bara för produktionskod. Fel som ligger i tests/ hör till röda tester.
if (/^(src|scripts)\//.test(fil)) {
  const tsc = kor(bin("tsc"), ["--noEmit", "--pretty", "false"]);
  if (tsc.status !== 0) {
    const typfel = tsc.stdout.split("\n").filter((rad) => /^(src|scripts)\/.*error TS\d+/.test(rad));
    for (const rad of typfel) {
      fel.push(rad);
      orsaker.push(`tsc: ${rad.match(/TS\d+/)[0]}`);
    }
  }
}

if (fel.length === 0) process.exit(0);

loggaFangst(HOOK, fil, [...new Set(orsaker)].join(", "));
console.error(
  [
    `${HOOK}: ${fil} följer inte kodstandarden. Filen är redan ändrad, så rätta felen nedan.`,
    "",
    ...fel,
    "",
    "Reglerna står i docs/standard.md. Stäng inte av en regel för att bli av med felet.",
  ].join("\n"),
);
process.exit(2);
