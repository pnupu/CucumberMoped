const { CucumberMopedPlugin } = require('./CucumberMopedPlugin');

/**
 * Main plugin export for Hedera Agent Kit
 * This file is loaded by the agent kit's plugin system
 */
module.exports = {
  name: 'cucumbermoped-plugin',
  version: '1.0.0',
  description: 'CucumberMoped trading and portfolio management plugin for Hedera Agent Kit',
  author: 'CucumberMoped Team',
  
  /**
   * Initialize the plugin with the provided configuration
   * @param {Object} config - Configuration object passed from HederaAgentKit
   * @returns {Object} Plugin instance with tools
   */
  initialize: (config) => {
    console.log('🥒 Initializing CucumberMoped Plugin...');
    
    // Extract services from appConfig
    const {
      hederaService,
      strategyService,
      db,
      walletService,
      telegramService
    } = config.appConfig || {};
    
    // Validate required services
    if (!hederaService || !strategyService || !db || !walletService) {
      console.warn('⚠️ Some CucumberMoped services not available, plugin may have limited functionality');
    }
    
    // Create plugin instance
    const plugin = new CucumberMopedPlugin({
      hederaService,
      strategyService,
      db,
      walletService,
      telegramService
    });
    
    console.log('✅ CucumberMoped Plugin initialized successfully');
    
    return {
      name: plugin.name,
      description: plugin.description,
      tools: plugin.getTools(),
      version: plugin.version
    };
  }
}; 