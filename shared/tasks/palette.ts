/** Colours for projects and labels (stored as hex on the record). */
export const LIST_COLORS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Sky', hex: '#0EA5E9' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Slate', hex: '#94A3B8' },
];

export const DEFAULT_LIST_COLOR = '#94A3B8';

/** Stable colour for records that predate the colour field (e.g. web projects). */
export function colorFor(id: string, explicit?: string | null): string {
  if (explicit) return explicit;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return LIST_COLORS[Math.abs(h) % LIST_COLORS.length].hex;
}
