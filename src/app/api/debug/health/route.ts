import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { withSession, onchainosEnv } from "@/lib/session/session";

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.ONCHAINOS_PATH) return process.env.ONCHAINOS_PATH;
  const projectBin = path.join(process.cwd(), "bin", "onchainos");
  if (fs.existsSync(projectBin)) return projectBin;
  return path.join(process.env.HOME ?? "~", ".local", "bin", "onchainos");
}

export const GET = withSession(async (request: NextRequest) => {
  const expected = process.env.DEBUG_HEALTH_TOKEN;
  const provided = request.headers.get("x-debug-token");
  if (!expected || provided !== expected) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const home = process.env.HOME ?? "(unset)";
  const cwd = process.cwd();
  const projectBin = path.join(cwd, "bin", "onchainos");
  const homeBin = path.join(home, ".local", "bin", "onchainos");
  const resolvedBin = resolveBin();

  const info: Record<string, unknown> = {
    paths: {
      projectBinExists: fs.existsSync(projectBin),
      homeBinExists: fs.existsSync(homeBin),
    },
  };

  if (fs.existsSync(resolvedBin)) {
    try {
      const { stdout } = await execFileAsync(resolvedBin, ["--version"], {
        timeout: 5000,
        env: onchainosEnv(),
      });
      info.binVersion = stdout.trim();
    } catch (e) {
      info.binError = String(e);
    }
  } else {
    info.binError = `Binary not found at any checked path`;
  }

  return NextResponse.json(info);
});
