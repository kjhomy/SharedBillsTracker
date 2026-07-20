// Deterministic color + icon assignment so the same category or member
// always renders with the same accent across every screen, without
// having to store a color choice anywhere.

const PALETTE = ['sky', 'mint', 'rose', 'lavender', 'peach', 'teal'];

const CATEGORY_EMOJI = {
  rent: '🏠',
  energy: '⚡',
  water: '💧',
  'council tax': '🏛️',
  internet: '📶',
};

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function tone(key) {
  return PALETTE[hash(key) % PALETTE.length];
}

export function categoryStyle(name) {
  const key = (name ?? 'Uncategorised').trim();
  const t = tone(key);
  return {
    bg: `bg-accent-${t}-bg`,
    text: `text-accent-${t}-text`,
    emoji: CATEGORY_EMOJI[key.toLowerCase()] ?? '💳',
  };
}

export function memberAvatar(name) {
  const key = (name ?? '?').trim();
  const initials =
    key
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  const t = tone(key);
  return { initials, bg: `bg-accent-${t}-bg`, text: `text-accent-${t}-text` };
}
