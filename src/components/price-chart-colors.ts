export function resolveThemeColors(theme: 'light' | 'dark') {
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const toColor = (varName: string, fallback: string) => {
    const value = root?.getPropertyValue(varName).trim();
    if (!value) return fallback;
    if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return value;

    const channels = value.split(/\s+/);
    if (channels.length !== 3 || channels.some((channel) => !/^\d+$/.test(channel))) return fallback;
    const numericChannels = channels.map(Number);
    if (numericChannels.some((channel) => channel < 0 || channel > 255)) return fallback;
    return `rgb(${numericChannels.join(', ')})`;
  };
  return {
    bg: toColor('--bg', theme === 'dark' ? '#14141a' : '#ffffff'),
    text: toColor('--text', theme === 'dark' ? '#f3f4f6' : '#111827'),
    muted: toColor('--muted', theme === 'dark' ? '#9696a5' : '#787887'),
    border: toColor('--border', theme === 'dark' ? '#1e1e26' : '#f0f0f4'),
    primary: toColor('--primary', '#3b82f6'),
    success: toColor('--success', '#22c55e'),
    danger: toColor('--danger', '#ef4444'),
  };
}
