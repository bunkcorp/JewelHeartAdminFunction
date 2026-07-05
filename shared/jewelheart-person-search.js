/**
 * Client-side person roster filter (50–80 names). Used by web SDUI personPicker;
 * server may import for tests.
 */

export const PERSON_PICKER_MAX_VISIBLE = 12;

function normalizePersonQuery(q) {
  return String(q || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function personWords(displayName) {
  return String(displayName || '')
    .toLowerCase()
    .split(/[\s\-']+/)
    .filter(Boolean);
}

function tokenWordStartMatch(token, words) {
  return words.some((w) => w.startsWith(token));
}

/** Multi-token: each token word-starts a name word, left-to-right (no reuse). */
function tokensMatchNameWordsInOrder(tokens, words) {
  if (!tokens.length || !words.length) return false;
  let wi = 0;
  for (const token of tokens) {
    let matched = false;
    for (let i = wi; i < words.length; i++) {
      if (words[i].startsWith(token)) {
        matched = true;
        wi = i + 1;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function scorePersonMatch(displayName, email, query) {
  const q = normalizePersonQuery(query);
  if (!q) return -1;
  const name = String(displayName || '');
  const nameLc = name.toLowerCase();
  const words = personWords(name);
  const tokens = q.split(' ').filter(Boolean);
  if (!tokens.length) return -1;

  if (tokens.length > 1) {
    if (!tokensMatchNameWordsInOrder(tokens, words)) return -1;
  } else {
    const token = tokens[0];
    const emailLocal = email ? String(email).toLowerCase().split('@')[0] : '';
    const emailHit = token.length >= 2 && emailLocal && emailLocal.startsWith(token);
    if (!tokenWordStartMatch(token, words) && !emailHit) return -1;
  }

  let score = tokens.length * 100;
  if (nameLc.startsWith(tokens[0])) score += 40;
  if (tokens.length > 1 && words.length > 1 && words[words.length - 1].startsWith(tokens[1])) {
    score += 30;
  }
  if (nameLc === q) score += 50;
  score -= name.length * 0.01;
  return score;
}

/** @returns {{ items: object[], total: number, capped: boolean }} */
export function filterPersonRoster(roster, query, options = {}) {
  const maxVisible = options.maxVisible ?? PERSON_PICKER_MAX_VISIBLE;
  const list = Array.isArray(roster) ? roster : [];
  const q = normalizePersonQuery(query);
  if (!q) {
    return { items: [], total: 0, capped: false };
  }
  const scored = [];
  for (const row of list) {
    const displayName = row.displayName || row.display_name || '';
    const email = row.email || '';
    const s = scorePersonMatch(displayName, email, q);
    if (s >= 0) scored.push({ row, score: s });
  }
  scored.sort((a, b) => b.score - a.score || String(a.row.displayName).localeCompare(String(b.row.displayName)));
  const total = scored.length;
  return {
    items: scored.slice(0, maxVisible).map((x) => x.row),
    total,
    capped: total > maxVisible,
  };
}
