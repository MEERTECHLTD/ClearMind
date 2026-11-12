/**
 * iOS-style app icon: a rounded-square (squircle-ish) gradient tile with a
 * glossy top highlight, soft shadow and a white glyph, like the icons in
 * iPhone Settings. One tint per area keeps ClearMind recognisable at a glance.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export const TINTS = {
  red: 'from-[#FF6B6B] to-[#E5383B]',
  rose: 'from-[#FF7A93] to-[#F0365F]',
  orange: 'from-[#FFB04A] to-[#FF7A1A]',
  amber: 'from-[#FFD25A] to-[#F5A70A]',
  green: 'from-[#5BE38B] to-[#22B45A]',
  teal: 'from-[#4FD8CC] to-[#12A69B]',
  cyan: 'from-[#5AD4F5] to-[#1AA3E0]',
  blue: 'from-[#5AA9FF] to-[#1F6BFF]',
  indigo: 'from-[#8A8CFF] to-[#5146E5]',
  violet: 'from-[#B57BFF] to-[#7B3FF2]',
  pink: 'from-[#FF8AD8] to-[#E0399F]',
  gray: 'from-[#A9B1BD] to-[#6B7381]',
  graphite: 'from-[#5C6370] to-[#2F343C]',
} as const;
export type Tint = keyof typeof TINTS;

export function AppIcon({ icon: Icon, tint, size = 22, className = '' }: { icon: LucideIcon; tint: Tint; size?: number; className?: string }) {
  const radius = Math.round(size * 0.27);
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center bg-gradient-to-b ${TINTS[tint]} shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_0_0_0.5px_rgba(0,0,0,0.08)] ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" style={{ borderTopLeftRadius: radius, borderTopRightRadius: radius }} />
      <Icon size={Math.round(size * 0.6)} strokeWidth={2.4} className="relative text-white drop-shadow-[0_0.5px_0.5px_rgba(0,0,0,0.25)]" />
    </span>
  );
}
