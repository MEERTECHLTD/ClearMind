import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Text, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error' | 'info';
export interface ToastAction { label: string; onPress: () => void }
interface ToastState { message: string; type: ToastType; action?: ToastAction }
type Show = (message: string, type?: ToastType, action?: ToastAction) => void;

const ToastContext = createContext<{ show: Show } | null>(null);

const COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-midnight-lighter',
};

/**
 * Plain toasts appear at the top. A toast with an action (e.g. "Undo") is a
 * bottom snackbar that stays a little longer and is tappable.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const show = useCallback<Show>(
    (message, type = 'info', action) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, type, action });
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, action ? 4500 : 2600);
    },
    [opacity, hide]
  );

  const snackbar = !!toast?.action;
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <SafeAreaView
          edges={snackbar ? ['bottom'] : ['top']}
          className={`absolute ${snackbar ? 'bottom-16 left-4 right-20 items-start' : 'top-0 left-0 right-0 items-center'}`}
          pointerEvents="box-none"
        >
          <Animated.View
            style={{ opacity }}
            className={`${snackbar ? 'mb-3 flex-row items-center' : 'mt-2'} px-4 py-3 rounded-2xl ${COLORS[toast.type]} max-w-full border border-line`}
            accessibilityLiveRegion="polite"
          >
            <Text className={`text-white font-medium ${snackbar ? 'flex-shrink' : 'text-center'}`}>{toast.message}</Text>
            {toast.action ? (
              <Pressable
                onPress={() => { toast.action!.onPress(); if (timer.current) clearTimeout(timer.current); hide(); }}
                hitSlop={10}
                className="ml-4 active:opacity-60"
                accessibilityRole="button"
              >
                <Text className="text-accent font-bold">{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): { show: Show } {
  return useContext(ToastContext) ?? { show: () => {} };
}
