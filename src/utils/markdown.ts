/**
 * Simple Markdown to HTML converter for note cards
 * Supports: headings, bold, italic, code, lists
 */

// Pre-compiled regexes to avoid recompilation on every line
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /\*(.+?)\*/g;
const CODE_RE = /`(.+?)`/g;

export function simpleMarkdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = escaped.split('\n');
  const out: string[] = [];
  let inList = false;
  let inCode = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<pre class="note-md-pre"><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) { out.push(line); continue; }
    const inlined = line
      .replace(BOLD_RE, '<strong>$1</strong>')
      .replace(ITALIC_RE, '<em>$1</em>')
      .replace(CODE_RE, '<code class="note-md-code">$1</code>');
    if (/^#{3,}\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h5 class="note-md-h">${inlined.replace(/^#{3,}\s+/, '')}</h5>`);
    } else if (/^##\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h4 class="note-md-h">${inlined.replace(/^##\s+/, '')}</h4>`);
    } else if (/^#\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 class="note-md-h">${inlined.replace(/^#\s+/, '')}</h3>`);
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { out.push('<ul class="note-md-ul">'); inList = true; }
      out.push(`<li>${inlined.replace(/^[-*]\s+/, '')}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (!inList) { out.push('<ul class="note-md-ul">'); inList = true; }
      out.push(`<li>${inlined.replace(/^\d+\.\s+/, '')}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(inlined ? `<p>${inlined}</p>` : '<br/>');
    }
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}
