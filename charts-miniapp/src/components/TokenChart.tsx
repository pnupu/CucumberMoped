import React from 'react';
import type { Token } from '../data/tokens';

interface TokenChartProps {
  token: Token;
}

const TokenChart: React.FC<TokenChartProps> = ({ token }) => {
  if (!token.iframeUrl) {
    return (
      <div className="chart-placeholder">
        <p>Chart not available for {token.symbol}</p>
      </div>
    );
  }

  return (
    <div className="token-chart">
      <div className="chart-header">
        <h3>{token.symbol}</h3>
        <span className="chain-badge">{token.chain}</span>
      </div>
      <div className="chart-container">
        <iframe
          height="400"
          width="100%"
          id={`geckoterminal-embed-${token.symbol}`}
          title={`${token.symbol} Chart`}
          src={token.iframeUrl}
          frameBorder="0"
          allow="clipboard-write"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default TokenChart; 