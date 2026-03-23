/**
 * Takes raw streaming markdown text and splits it into:
 * - `rendered`: complete blocks that can be safely rendered as markdown
 * - `tail`: the incomplete remainder that should stay as raw text
 *
 * A block is "complete" when it ends with a blank line or a block fence closing.
 */
export function splitCompleteMarkdownBlocks(raw: string): { rendered: string; tail: string } {
  if (!raw.includes('\n') && !raw.includes('`')) {
    // Single line, no fence markers — nothing to progressive-render yet
    return { rendered: '', tail: raw };
  }

  // Find the last blank-line boundary (double newline) in the content.
  // Everything before it (up to the last \n\n) is a "complete" paragraph block.
  const doubleNl = raw.lastIndexOf('\n\n');
  const lastBlank = doubleNl >= 0 ? doubleNl : raw.lastIndexOf('\n');

  if (lastBlank < 0) {
    // No newline at all — treat as tail until a fence closes
    const fenceClose = raw.lastIndexOf('```');
    if (fenceClose > 0 && raw[fenceClose + 3] !== '`') {
      const afterClose = fenceClose + 3;
      const rendered = raw.slice(0, afterClose);
      const tail = raw.slice(afterClose);
      return { rendered, tail };
    }
    return { rendered: '', tail: raw };
  }

  // Find the last truly complete block boundary.
  // A complete block ends with \n\n (paragraph break) or a closing fence with no trailing content.
  const lastDoubleNl = raw.lastIndexOf('\n\n');
  let splitIdx = lastDoubleNl;

  if (raw.endsWith('\n\n')) {
    // Content ends with blank line — all up to last \n\n is complete
    splitIdx = raw.length;
  } else if (raw.endsWith('\n')) {
    // Ends with single newline — split at last blank
    splitIdx = lastDoubleNl >= 0 ? lastDoubleNl : -1;
  } else {
    // Ends mid-line — split at last blank
    splitIdx = lastDoubleNl >= 0 ? lastDoubleNl : -1;
  }

  // Check for unclosed code fences — if the last fence is opening-only, don't
  // split inside it.
  const lastTripleBacktick = raw.lastIndexOf('```');
  if (lastTripleBacktick >= 0) {
    const afterFence = raw.slice(lastTripleBacktick + 3);
    const hasClosingFence = afterFence.includes('\n```') || afterFence.startsWith('```');
    const isJustOpening = !afterFence.includes('\n');
    if (!hasClosingFence && (isJustOpening || afterFence.trim() === '')) {
      // Fence is unclosed — keep everything up to the opening fence as rendered,
      // the rest (including the unclosed fence line) is the tail.
      return { rendered: raw.slice(0, lastTripleBacktick), tail: raw.slice(lastTripleBacktick) };
    }
  }

  if (splitIdx <= 0) {
    return { rendered: '', tail: raw };
  }

  return {
    rendered: raw.slice(0, splitIdx),
    tail: raw.slice(splitIdx),
  };
}
