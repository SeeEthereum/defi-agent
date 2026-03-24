import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

export async function GET() {
  const home = process.env.HOME ?? "(unset)";
  const binPath = process.env.ONCHAINOS_PATH ?? `${home}/.local/bin/onchainos`;

  const info: Record<string, unknown> = {
    home,
    binPath,
    binExists: fs.existsSync(binPath),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      OKX_API_KEY: process.env.OKX_API_KEY ? "set" : "missing",
      OKX_SECRET_KEY: process.env.OKX_SECRET_KEY ? "set" : "missing",
      OKX_PASSPHRASE: process.env.OKX_PASSPHRASE ? "set" : "missing",
      OKX_PROJECT_ID: process.env.OKX_PROJECT_ID ? "set" : "missing",
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ? "set" : "missing",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "set" : "missing",
    },
  };

  if (info.binExists) {
    try {
      const { stdout } = await execFileAsync(binPath, ["--version"], {
        timeout: 5000,
        env: { ...process.env },
      });
      info.binVersion = stdout.trim();
    } catch (e) {
      info.binError = String(e);
    }
  }

  return NextResponse.json(info);
}
