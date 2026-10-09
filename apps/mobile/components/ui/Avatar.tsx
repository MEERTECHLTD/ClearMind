import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { T } from '../../lib/theme';

/** The signed-in user's picture (profile photo, else Google photo), falling back to their initial. */
export function Avatar({ size = 36 }: { size?: number }) {
  const { profile, user } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);
  const photo = (profile as any)?.photoURL || user?.photoURL || null;
  const name = profile?.nickname || user?.displayName || user?.email?.split('@')[0] || '?';
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photo && failed !== photo) {
    return <Image source={{ uri: photo }} style={box} onError={() => setFailed(photo)} accessibilityLabel={`${name}'s profile photo`} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[box, { backgroundColor: T.accent }]} className="items-center justify-center">
      <Text className="text-white font-extrabold" style={{ fontSize: size * 0.42 }}>{name[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}
