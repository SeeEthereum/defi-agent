import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.ONCHAINOS_PATH) return process.env.ONCHAINOS_PATH;
  const projectBin = path.join(process.cwd(), "bin", "onchainos");
  if (fs.existsSync(projectBin)) return projectBin;
  return path.join(process.env.HOME ?? "~", ".local", "bin", "onchainos");
}

export async function GET() {
  const home = process.env.HOME ?? "(unset)";
  const cwd = process.cwd();
  const projectBin = path.join(cwd, "bin", "onchainos");
  const homeBin = path.join(home, ".local", "bin", "onchainos");
  const resolvedBin = resolveBin();

  const info: Record<string, unknown> = {
    home,
    cwd,
    paths: {
      projectBin,
      projectBinExists: fs.existsSync(projectBin),
      homeBin,
      homeBinExists: fs.existsSync(homeBin),
      resolved: resolvedBin,
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      ONCHAINOS_PATH: process.env.ONCHAINOS_PATH ?? "(not set)",
      OKX_API_KEY: process.env.OKX_API_KEY ? "set" : "missing",
      OKX_SECRET_KEY: process.env.OKX_SECRET_KEY ? "set" : "missing",
      OKX_PASSPHRASE: process.env.OKX_PASSPHRASE ? "set" : "missing",
      OKX_PROJECT_ID: process.env.OKX_PROJECT_ID ? "set" : "missing",
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ? "set" : "missing",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "set" : "missing",
    },
  };

  if (fs.existsSync(resolvedBin)) {
    try {
      const { stdout } = await execFileAsync(resolvedBin, ["--version"], {
        timeout: 5000,
        env: { ...process.env },
      });
      info.binVersion = stdout.trim();
    } catch (e) {
      info.binError = String(e);
    }
  } else {
    info.binError = `Binary not found at any checked path`;
  }

  return NextResponse.json(info);
}
