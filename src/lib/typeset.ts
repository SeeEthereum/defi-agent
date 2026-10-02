/**
 * Editorial typesetting for display copy.
 *
 * - straight quotes become typographic ones (“ ” and ’);
 * - three dots become an ellipsis;
 * - the last two words are joined by a no-break space, so a paragraph or a
 *   heading never ends with one word alone on its last line.
 *
 * Em and en dashes are not converted here: the copy must not contain them,
 * and a test fails if it does.
 */

const NBSP = " ";

export function typeset(text: string): string {
  let out = text
    .replace(/\.\.\./g, "…")
    // apostrophes inside or at the end of words: it's, OKX's, users'
    .replace(/(\w)'(\w|\s|$)/g, "$1’$2")
    // double quotes: opening after start/space/bracket, closing otherwise
    .replace(/(^|[\s([{])"/g, "$1“")
    .replace(/"/g, "”")
    // remaining single quotes: opening after start/space, closing otherwise
    .replace(/(^|[\s([{])'/g, "$1‘")
    .replace(/'/g, "’");

  const trimmed = out.trimEnd();
  const lastSpace = trimmed.lastIndexOf(" ");
  // Join only when the result stays short enough to wrap as a unit.
  if (lastSpace > 0 && trimmed.length - lastSpace <= 24) {
    out = trimmed.slice(0, lastSpace) + NBSP + trimmed.slice(lastSpace + 1) + out.slice(trimmed.length);
  }
  return out;
}
