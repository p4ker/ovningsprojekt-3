import { execFile } from "node:child_process";
import path from "node:path";

const root = path.join(__dirname, "..", "..");

// Kör nattrapporten som underprocess. Miljövariabeln NATTRAPPORT väljer kommando:
// "python" (standard) eller "ts". Underprocessen ärver DATABASE_URL från tests/helpers/env.ts.
export function kor(args: string[]): Promise<{ stdout: string; code: number }> {
  const variant = process.env.NATTRAPPORT ?? "python";
  let kommando: string;
  let argument: string[];
  if (variant === "python") {
    kommando = "python3";
    argument = ["jobs/nightly_report.py", ...args];
  } else if (variant === "ts") {
    kommando = "npx";
    argument = ["tsx", "jobs/nattrapport.ts", ...args];
  } else {
    throw new Error(`Okänt värde för NATTRAPPORT: "${variant}" (giltiga: python, ts)`);
  }
  return new Promise((resolve) => {
    execFile(kommando, argument, { cwd: root, env: process.env }, (error, stdout) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ stdout, code });
    });
  });
}
