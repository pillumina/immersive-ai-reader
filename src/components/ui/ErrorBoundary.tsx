import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 bg-[var(--color-bg)]">
          <div className="bg-[var(--color-bg-raised)] rounded-2xl shadow-lg p-8 max-w-md w-full text-center border border-[var(--color-border)]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-danger-subtle)] flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-[var(--color-danger)]" />
            </div>

            <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">
              Something went wrong
            </h2>

            <p className="text-[var(--color-text-secondary)] text-sm mb-6">
              We encountered an unexpected error. The app has been reset to a safe state.
            </p>

            {this.state.error && (
              <div className="mb-6 p-4 bg-[var(--color-bg-hover)] rounded-lg text-left">
                <p className="text-xs font-mono text-[var(--color-danger)] break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </Button>

              <Button
                onClick={this.handleReset}
                className="flex items-center gap-2"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
