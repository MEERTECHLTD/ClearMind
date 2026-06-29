import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';

/**
 * Top-level error boundary so a render/init error shows a readable screen instead
 * of a white-screen crash. (The real config-missing fix is in lib/config.ts; this
 * is the safety net.)
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#05050A', padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: '#3B82F6', fontSize: 22, fontWeight: '800' }}>ClearMind</Text>
        <Text style={{ color: '#e2e8f0', fontSize: 16, marginTop: 12 }}>Something went wrong starting the app.</Text>
        <ScrollView style={{ maxHeight: 220, marginTop: 12 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12 }}>{error.message}{'\n'}{error.stack}</Text>
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ marginTop: 20, backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 999, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}
