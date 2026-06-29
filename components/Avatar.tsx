import React, { useState } from 'react';

/**
 * User avatar — shows the real profile picture everywhere, falling back to the
 * GitHub avatar, then to initials. Used in the top bar, sidebar, settings, and
 * anywhere a person is shown. Handles broken photo URLs (onError → initials).
 */
export const Avatar: React.FC<{
  nickname?: string;
  photoURL?: string | null;
  githubUsername?: string;
  email?: string | null;
  size?: number;
  ring?: boolean;
  className?: string;
}> = ({ nickname, photoURL, githubUsername, email, size = 32, ring = false, className = '' }) => {
  const [broken, setBroken] = useState(false);
  const src = !broken ? photoURL || (githubUsername ? `https://github.com/${githubUsername}.png` : '') : '';
  const ringCls = ring ? 'ring-2 ring-blue-500' : '';
  const label = (nickname || email || 'U').trim();

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover border dark:border-gray-700 border-gray-200 bg-midnight ${ringCls} ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={`rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white uppercase select-none ${ringCls} ${className}`}
    >
      {label.substring(0, 2)}
    </div>
  );
};
