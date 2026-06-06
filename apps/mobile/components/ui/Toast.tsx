import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Text, Animated, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error' | 'info';
interface ToastState { message: string; type: ToastType }

const ToastContext = createContext<{ show: (message: string, type?: ToastType) => void } | null>(null);

const COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-midnight-lighter',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, type });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      }, 2600);
    },
    [opacity]
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0 items-center" pointerEvents="none">
          <Animated.View style={{ opacity }} className={`mt-2 px-4 py-3 rounded-2xl ${COLORS[toast.type]} max-w-[90%]`}>
            <Text className="text-white font-medium text-center">{toast.message}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): { show: (message: string, type?: ToastType) => void } {
  return useContext(ToastContext) ?? { show: () => {} };
}
