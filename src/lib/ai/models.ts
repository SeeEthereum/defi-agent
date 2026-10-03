/**
 * Which OpenAI models run the assistant. Both can be changed from the
 * environment without a deploy of new code.
 *
 * - Main: GPT-6.1 Sol, near the flagship on agentic tool use at a fifth of
 *   its price. Tool calling needs the Responses API.
 * - Guard: GPT-6 Luna, the cheap high-volume model, only answers "is this
 *   message about what albicocca does?".
 */

export const MAIN_MODEL = process.env.OPENAI_MODEL || "gpt-6.1-sol";
export const GUARD_MODEL = process.env.OPENAI_GUARD_MODEL || "gpt-6-luna";

const EFFORTS = ["low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];
const envEffort = process.env.OPENAI_REASONING_EFFORT as Effort | undefined;
export const MAIN_EFFORT: Effort = envEffort && EFFORTS.includes(envEffort) ? envEffort : "medium";

/** Shown in the assistant's header. */
export const MAIN_MODEL_LABEL = MAIN_MODEL === "gpt-6.1-sol" ? "GPT-6.1 Sol" : MAIN_MODEL;
