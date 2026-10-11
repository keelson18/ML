export const MAX_TURNS = 20;
export const MAX_MESSAGE_CHARS = 2000;

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

export type ValidationResult =
  | { ok: true; messages: CoachMessage[] }
  | { ok: false; error: string };

function stripDisallowedControlChars(value: string): string {
  return Array.from(value).filter((char) => {
    const code = char.charCodeAt(0);
    return code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code !== 0x7f);
  }).join("");
}

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

export function validateMessages(input: unknown): ValidationResult {
  if (!Array.isArray(input)) return fail("messages must be an array");
  if (input.length < 1 || input.length > MAX_TURNS) {
    return fail(`messages must contain 1 to ${MAX_TURNS} turns`);
  }

  const messages: CoachMessage[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) return fail("each message must be an object");
    const { role, content } = item as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return fail("role must be user or assistant");
    if (typeof content !== "string") return fail("content must be a string");
    if (content.length > MAX_MESSAGE_CHARS) {
      return fail(`each message must be at most ${MAX_MESSAGE_CHARS} characters`);
    }
    const cleaned = stripDisallowedControlChars(content).trim();
    if (cleaned.length === 0) return fail("messages must not be empty");
    messages.push({ role, content: cleaned });
  }

  if (messages[messages.length - 1].role !== "user") {
    return fail("the last message must be from the user");
  }
  return { ok: true, messages };
}
