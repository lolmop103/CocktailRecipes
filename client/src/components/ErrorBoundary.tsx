import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last line of defence: a render error anywhere below this boundary would
 * otherwise unmount the whole app and leave a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- no logging transport on the client; this is the only sink.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private readonly handleReload = () => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <h2>Something went wrong.</h2>
        <p>The page hit an unexpected error. Reloading usually clears it.</p>
        <button type="button" className="btn-primary" onClick={this.handleReload}>
          Reload
        </button>
      </div>
    );
  }
}
