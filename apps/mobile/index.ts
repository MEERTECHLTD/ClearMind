/**
 * App entry. Registers headless work BEFORE the router boots:
 *  - Android home-screen widget task handler,
 *  - periodic background sync (OS-scheduled, battery friendly — no loops).
 */
import 'expo-router/entry';
import { Platform } from 'react-native';
import { registerBackgroundSync } from './services/background';

if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  registerWidgetTaskHandler(require('./widgets/handler').widgetTaskHandler);
}

registerBackgroundSync();
