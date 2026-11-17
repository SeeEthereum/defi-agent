import { beforeEach, describe, expect, it, vi } from "vitest";

const children = vi.hoisted(() => [] as Array<{ exitCode: number | null; signalCode: string | null; kill: () => void }>);
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const execFile = () => {
    const child = { exitCode: null as number | null, signalCode: null as string | null, kill: vi.fn() };
    children.push(child);
    return child;
  };
  return { ...actual, execFile, default: { ...actual, execFile } };
});

const { canStartLogin, clearLoginSession, MAX_PENDING_LOGINS, startLoginPoll } = await import("./login-session");
const { runWithSession } = await import("@/lib/session/session");

const session = (i: number) => ({ sid: String(i).padStart(43, "s"), home: `/tmp/login-test-${i}` });

beforeEach(() => {
  for (let i = 0; i < MAX_PENDING_LOGINS + 2; i++) runWithSession(session(i), () => clearLoginSession());
  children.length = 0;
});

describe("login poll cap", () => {
  it("stops new sessions once MAX_PENDING_LOGINS polls are running", () => {
    for (let i = 0; i < MAX_PENDING_LOGINS; i++) {
      runWithSession(session(i), () => startLoginPoll(`auth-${i}`, "https://example.com"));
    }
    expect(runWithSession(session(MAX_PENDING_LOGINS), () => canStartLogin())).toBe(false);
    // A session that already has a poll may replace it.
    expect(runWithSession(session(0), () => canStartLogin())).toBe(true);
  });

  it("counts only polls that are still running", () => {
    for (let i = 0; i < MAX_PENDING_LOGINS; i++) {
      runWithSession(session(i), () => startLoginPoll(`auth-${i}`, "https://example.com"));
    }
    children[0].exitCode = 0;
    expect(runWithSession(session(MAX_PENDING_LOGINS), () => canStartLogin())).toBe(true);
  });
});
