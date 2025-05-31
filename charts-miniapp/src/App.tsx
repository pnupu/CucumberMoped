import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import type { Token } from './data/tokens';
import { getTokenBySymbol, TOKENS } from './data/tokens';
import TokenList from './components/TokenList';
import TokenChart from './components/TokenChart';
import './App.css';

// Simple error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🔥 Charts App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '16px',
            maxWidth: '400px'
          }}>
            <h1>🚨 Something went wrong</h1>
            <p>Charts app encountered an error</p>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '8px',
                marginTop: '1rem',
                cursor: 'pointer'
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initDataUnsafe: Record<string, unknown>;
        themeParams: Record<string, string>;
        ready: () => void;
        expand: () => void;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
        close: () => void;
      };
    };
  }
}

const ChartsView: React.FC = () => {
  const navigate = useNavigate();
  const { symbol } = useParams<{ symbol?: string }>();
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');

  useEffect(() => {
    if (symbol) {
      const token = getTokenBySymbol(symbol.toUpperCase());
      if (token) {
        setSelectedToken(token);
        setViewMode('chart');
      }
    }
  }, [symbol]);

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setViewMode('chart');
    navigate(`/charts/${token.symbol.toLowerCase()}`);
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedToken(null);
    navigate('/charts');
  };

  // Show token list when no token is selected or in list mode
  if (viewMode === 'list' || !selectedToken) {
    return (
      <div className="charts-container">
        <div className="header">
          <h1>📊 Token Charts</h1>
          <p>Select a token to view its price chart</p>
        </div>
        <TokenList 
          onTokenSelect={handleTokenSelect}
          selectedToken={selectedToken || undefined}
        />
      </div>
    );
  }

  // Show individual chart
  return (
    <div className="charts-container">
      <div className="header">
        <button className="back-button" onClick={handleBackToList}>
          ← Back to Tokens
        </button>
        <h1>📊 {selectedToken.symbol} Chart</h1>
      </div>
      <TokenChart token={selectedToken} />
    </div>
  );
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  
  const navigateToCharts = () => {
    navigate('/charts');
  };

  return (
    <div className="home-container">
      <div className="welcome-section">
        <h1>🥒 CucumberMoped Charts</h1>
        <p>View real-time price charts for supported tokens</p>
        
        <div className="stats">
          <div className="stat">
            <span className="stat-number">{TOKENS.length}</span>
            <span className="stat-label">Total Tokens</span>
          </div>
          <div className="stat">
            <span className="stat-number">{TOKENS.filter(t => t.iframeUrl).length}</span>
            <span className="stat-label">With Charts</span>
          </div>
        </div>

        <button className="primary-button" onClick={navigateToCharts}>
          📊 View Charts
        </button>
      </div>
    </div>
  );
};

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize Telegram Web App
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      
      // Apply Telegram theme
      if (tg.themeParams.bg_color) {
        document.body.style.backgroundColor = tg.themeParams.bg_color;
      }
      if (tg.themeParams.text_color) {
        document.body.style.color = tg.themeParams.text_color;
      }
    }

    // Debug: Log when app mounts
    console.log('🥒 CucumberMoped Charts App mounted');
    console.log('Current path:', window.location.pathname);
    console.log('Available tokens:', TOKENS.length);

    // Simulate brief initialization delay
    setTimeout(() => {
      setIsLoading(false);
    }, 100);
  }, []);

  // Determine basename from current URL
  const basename = window.location.pathname.startsWith('/charts') ? '/charts' : '';

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '2rem',
          borderRadius: '16px',
          textAlign: 'center'
        }}>
          <h2>🥒 Loading Charts...</h2>
          <div className="loading">📊</div>
        </div>
      </div>
    );
  }

  return (
    <Router basename={basename}>
      <ErrorBoundary>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/charts" element={<ChartsView />} />
            <Route path="/charts/:symbol" element={<ChartsView />} />
            {/* Catch-all route for direct access */}
            <Route path="/:symbol" element={<ChartsView />} />
          </Routes>
        </div>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
