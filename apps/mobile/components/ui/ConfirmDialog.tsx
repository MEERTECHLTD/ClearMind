import { Alert } from 'react-native';

/** Promise wrapper over Alert.alert (replaces web window.confirm). */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirmText ?? 'OK',
          style: opts.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
