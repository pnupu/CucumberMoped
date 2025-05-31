import React, { useState, useMemo } from 'react';
import type { Token } from '../data/tokens';
import { TOKENS, NetworkEnum, getTokensByChain, getChainEmoji } from '../data/tokens';

interface TokenListProps {
  onTokenSelect: (token: Token) => void;
  selectedToken?: Token;
}

const TokenList: React.FC<TokenListProps> = ({ onTokenSelect, selectedToken }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChain, setSelectedChain] = useState<NetworkEnum | 'all'>('all');

  const filteredTokens = useMemo(() => {
    let tokens = TOKENS;
    
    if (selectedChain !== 'all') {
      tokens = getTokensByChain(selectedChain);
    }
    
    if (searchTerm) {
      tokens = tokens.filter(token => 
        token.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return tokens;
  }, [searchTerm, selectedChain]);

  const chains = Object.values(NetworkEnum);

  return (
    <div className="token-list">
      <div className="filters">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search tokens..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="chain-filter">
          <button
            className={`chain-button ${selectedChain === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedChain('all')}
          >
            All Chains
          </button>
          {chains.map(chain => (
            <button
              key={chain}
              className={`chain-button ${selectedChain === chain ? 'active' : ''}`}
              onClick={() => setSelectedChain(chain)}
            >
              {getChainEmoji(chain)} {chain.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="tokens-grid">
        {filteredTokens.map(token => (
          <div
            key={`${token.symbol}-${token.chain}`}
            className={`token-card ${selectedToken?.symbol === token.symbol && selectedToken?.chain === token.chain ? 'selected' : ''} ${!token.iframeUrl ? 'no-chart' : ''}`}
            onClick={() => onTokenSelect(token)}
          >
            <div className="token-info">
              <div className="token-symbol">{token.symbol}</div>
              <div className="token-chain">
                {getChainEmoji(token.chain)} {token.chain}
              </div>
              <div className="token-address">
                {token.address.slice(0, 6)}...{token.address.slice(-4)}
              </div>
              {!token.iframeUrl && (
                <div className="no-chart-indicator">No Chart</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredTokens.length === 0 && (
        <div className="empty-state">
          <p>No tokens found matching your criteria.</p>
        </div>
      )}
    </div>
  );
};

export default TokenList; 