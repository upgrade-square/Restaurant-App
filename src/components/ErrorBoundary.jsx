import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', textAlign: 'center', background: '#fff1f1', border: '1px solid #fee2e2', borderRadius: '12px', margin: '20px' }}>
                    <h2 style={{ color: 'var(--danger)' }}>Something went wrong</h2>
                    <p style={{ color: 'var(--text-muted)' }}>The component failed to load. Please try refreshing the page.</p>
                    <button
                        className="login-btn"
                        style={{ width: 'auto', padding: '10px 20px', marginTop: '20px' }}
                        onClick={() => window.location.reload()}
                    >
                        Refresh Page
                    </button>
                    {process.env.NODE_ENV === 'development' && (
                        <pre style={{ textAlign: 'left', marginTop: '20px', fontSize: '0.8rem', overflow: 'auto', maxHeight: '200px' }}>
                            {this.state.error && this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
