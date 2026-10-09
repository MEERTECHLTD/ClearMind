import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { isChunkLoadError, resetFailedLazy } from '../utils/lazyWithRetry';

interface Props {
  /** Changing this (e.g. the route) clears the error and retries. */
  resetKey: string;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Contains failures of a (lazy) view so one broken view doesn't blank the whole
 * app. Chunk-load failures (stale tab after a deploy, offline) get a friendly
 * "Reload" screen; navigating to another view resets the boundary.
 */
export class ViewErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('View failed to render', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.retry();
  }

  retry = () => {
    resetFailedLazy();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <div className="flex-1 h-full flex items-center justify-center p-6 bg-slate-100 dark:bg-midnight" role="alert">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-gray-200 dark:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400">
            {offline ? <WifiOff size={22} /> : <AlertTriangle size={22} />}
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {offline ? 'You’re offline' : chunk ? 'A new version of ClearMind is available' : 'This view hit a problem'}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {offline
              ? 'This part of the app hasn’t been downloaded yet. Reconnect and try again.'
              : chunk
                ? 'Reload to finish updating. Your data is saved.'
                : 'Try again, or reload the app. Your data is saved.'}
          </p>
          <div className="mt-5 flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw size={15} />Reload
            </button>
            <button
              onClick={this.retry}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:hover:bg-white/10"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
