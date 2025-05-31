import {
  HederaConversationalAgent,
  HederaAgentKit,
  ServerSigner
} from '@hashgraphonline/hedera-agent-kit';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { HederaService } from './HederaService';
import { TelegramBotService } from './TelegramBotService';
import { StrategyService } from './StrategyService';
import { PrismaDatabaseService } from './PrismaDatabaseService';
import { WalletService } from './WalletService';

export interface AgentResponse {
  output: string;
  transactionBytes?: string;
  scheduleId?: string;
  error?: string;
}

export interface ChatMessage {
  type: 'human' | 'ai' | 'system';
  content: string;
}

export class HederaAgentService {
  private conversationalAgent?: HederaConversationalAgent;
  private agentKit?: HederaAgentKit;
  private signer?: ServerSigner;
  private llm?: BaseChatModel;
  private isInitialized = false;

  constructor(
    private hederaService: HederaService,
    private telegramService: TelegramBotService,
    private strategyService: StrategyService,
    private db: PrismaDatabaseService,
    private walletService: WalletService,
    private config: {
      operatorAccountId: string;
      operatorPrivateKey: string;
      network: 'mainnet' | 'testnet';
      openAIApiKey?: string;
      operationalMode?: 'directExecution' | 'provideBytes';
      userAccountId?: string;
      verbose?: boolean;
    }
  ) {}

  /**
   * Initialize the Hedera Agent Kit and conversational agent
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🤖 Hedera Agent Service already initialized');
      return;
    }

    try {
      console.log('🤖 Initializing Hedera Agent Service...');

      // Create the signer
      this.signer = new ServerSigner(
        this.config.operatorAccountId,
        this.config.operatorPrivateKey,
        this.config.network
      );

      // Create LLM instance if API key is provided - USE GPT-4-TURBO for larger context
      if (this.config.openAIApiKey) {
        this.llm = new ChatOpenAI({
          openAIApiKey: this.config.openAIApiKey,
          modelName: 'gpt-4-turbo', // Changed from 'gpt-4' to handle large context
          temperature: 0.1,
          maxTokens: 4096, // Reasonable response length
        });
      }

      // Initialize base HederaAgentKit with proper plugin configuration
      console.log('🔌 Initializing HederaAgentKit with CucumberMoped plugin...');
      
      // Use the JavaScript plugin structure that HederaAgentKit expects
      const { CucumberMopedPlugin } = require('../plugins/hedera-agent/CucumberMopedPlugin.js');
      
      const pluginContext = {
        hederaService: this.hederaService,
        strategyService: this.strategyService,
        db: this.db,
        walletService: this.walletService,
        telegramService: this.telegramService
      };

      const cucumberPlugin = new CucumberMopedPlugin(pluginContext);
      
      this.agentKit = new HederaAgentKit(
        this.signer,
        cucumberPlugin, // Pass the plugin instance
        this.config.operationalMode || 'provideBytes'
      );

      await this.agentKit.initialize();
      console.log('✅ HederaAgentKit initialized');

      // Get our custom tools manually
      const customTools = cucumberPlugin.getTools();
      console.log(`🥒 Loaded ${customTools.length} custom CucumberMoped tools`);

      // Store custom tools for later use in getCuratedTools
      (this as any).customTools = customTools;

      // Get total tools available (should now include base Hedera tools)
      const allBaseTools = this.agentKit.getAggregatedLangChainTools();
      console.log(`🔧 Total tools loaded: ${allBaseTools.length}`);
      console.log(`🔧 Tool names:`, allBaseTools.slice(0, 15).map(t => t.name)); // Show first 15 tools

      // Skip HederaConversationalAgent - create our own agent with curated tools
      console.log('🔧 Creating custom agent with curated tools instead of using HederaConversationalAgent...');
      
      // The conversational agent will be undefined - we'll handle everything in processMessage
      this.conversationalAgent = undefined as any;
      
      console.log('✅ Custom agent setup complete - will use direct LangChain integration');

      this.isInitialized = true;
      console.log('✅ HederaAgentService fully initialized');
      console.log(`🔧 Operational mode: ${this.config.operationalMode || 'provideBytes'}`);
      console.log(`🌐 Network: ${this.config.network}`);
      console.log(`👤 Operator: ${this.config.operatorAccountId}`);
      console.log(`🤖 Model: ${this.llm ? 'gpt-4-turbo (128K context)' : 'No LLM configured'}`);

    } catch (error) {
      console.error('❌ Error initializing Hedera Agent Service:', error);
      throw new Error(`Failed to initialize Hedera Agent Service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a user message and get AI response with potential Hedera actions
   * Uses curated tool set instead of all 87 tools
   */
  async processMessage(
    userMessage: string,
    chatHistory: ChatMessage[] = [],
    userContext?: {
      userId: number;
      username?: string;
      accountId?: string;
      isVerified?: boolean;
    }
  ): Promise<AgentResponse> {
    if (!this.isInitialized || !this.llm) {
      throw new Error('Hedera Agent Service not initialized. Call initialize() first.');
    }

    try {
      console.log(`🤖 Processing message: "${userMessage}"`);
      console.log(`🤖 User context:`, { userId: userContext?.userId, username: userContext?.username, isVerified: userContext?.isVerified });

      // Create our own agent with curated tools
      const { AgentExecutor, createReactAgent } = await import('langchain/agents');
      const { pull } = await import('langchain/hub');

      // Get curated tools
      const curatedTools = this.getCuratedTools(userContext);
      console.log(`🎯 Creating custom agent with ${curatedTools.length} curated tools`);

      // Important: Guide the AI to use our CucumberMoped tools for portfolio questions
      let guidanceNote = '';
      if (userMessage.toLowerCase().includes('portfolio')) {
        guidanceNote = `\n\n🎯 CRITICAL TOOL SELECTION GUIDANCE:\nThis is a CucumberMoped trading platform question about PORTFOLIO/TRADING.\n- For "my portfolio", "portfolio status", "what do I own" → use "get_user_portfolio_summary" \n- For "portfolio allocation", "Black-Litterman optimization" → use "get_portfolio_allocation"\n- DO NOT use Hedera account balance tools for portfolio questions\n- The user wants trading portfolio info, not Hedera account balances\n- CucumberMoped provides AI-optimized trading portfolios via Black-Litterman\n- User ID is available: ${userContext?.userId}\n\nRemember: Use CucumberMoped tools for trading questions!`;
      }

      // Convert chat history to LangChain format
      const langChainHistory = chatHistory.map(msg => {
        if (msg.type === 'human') {
          return { type: 'human' as const, content: msg.content };
        } else {
          return { type: 'ai' as const, content: msg.content };
        }
      });

      // Get the ReAct prompt template
      const prompt = await pull("hwchase17/react") as any; // Cast to any to avoid type issues

      // Create the agent
      const agent = await createReactAgent({
        llm: this.llm,
        tools: curatedTools,
        prompt,
      });

      // Create the agent executor
      const agentExecutor = new AgentExecutor({
        agent,
        tools: curatedTools,
        verbose: false,
        maxIterations: 5,
        returnIntermediateSteps: true
      });

      // Process with guided message
      const guidedMessage = userMessage + guidanceNote;
      console.log(`🤖 Guided message length: ${guidedMessage.length} characters`);
      
      const result = await agentExecutor.invoke({
        input: guidedMessage,
        chat_history: langChainHistory
      });

      console.log(`🤖 Agent result:`, result);
      console.log(`🤖 Agent output length: ${result?.output?.length || 0}`);

      return {
        output: result.output || 'No response generated.',
        // For now, we don't handle transaction bytes or schedules
        transactionBytes: undefined,
        scheduleId: undefined,
        error: undefined
      };
    } catch (error) {
      console.error('❌ Error processing message:', error);
      return {
        output: 'Sorry, I encountered an error processing your request. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get curated list of essential tools (instead of all 87 tools)
   */
  private getCuratedTools(userContext?: { userId: number; username?: string; accountId?: string; isVerified?: boolean }): any[] {
    if (!this.isInitialized || !this.agentKit) {
      return [];
    }

    try {
      // Get all base tools directly from agentKit
      const allBaseTools = this.agentKit.getAggregatedLangChainTools();
      
      // Essential Hedera tools only (instead of all 80)
      const essentialHederaToolNames = [
        'hedera-account-transfer-hbar',
        'hedera-hcs-create-topic',
        'hedera-get-account-balance',
        'hedera-get-account-info',
        'hedera-get-account-tokens',
        'hedera-get-network-info'
      ];

      // Filter to only essential Hedera tools
      const essentialHederaTools = allBaseTools.filter((tool: any) => 
        essentialHederaToolNames.includes(tool.name)
      );

      console.log(`🔧 Filtered Hedera tools: ${essentialHederaTools.length}/${allBaseTools.length}`);
      console.log('🔧 Essential tools:', essentialHederaTools.map((t: any) => t.name));

      // Create context-aware custom tools
      const customTools = this.createContextAwareCustomTools(userContext);
      console.log(`🥒 Custom tools: ${customTools.length}`);

      // Combine for final curated set
      const curatedTools = [...essentialHederaTools, ...customTools];
      console.log(`🎯 Total curated tools: ${curatedTools.length} (was ${allBaseTools.length + customTools.length})`);

      return curatedTools;
    } catch (error) {
      console.error('Error curating tools:', error);
      return [];
    }
  }

  /**
   * Create context-aware custom tools that have access to the current user context
   */
  private createContextAwareCustomTools(userContext?: { userId: number; username?: string; accountId?: string; isVerified?: boolean }): any[] {
    // Dynamically import the plugin
    const CucumberMopedPlugin = require('../plugins/hedera-agent/CucumberMopedPlugin.js');
    
    // Create plugin context with user context
    const pluginContext = {
      hederaService: this.hederaService,
      strategyService: this.strategyService,
      db: this.db,
      walletService: this.walletService,
      userContext: userContext // Pass user context to plugin
    };

    const plugin = new CucumberMopedPlugin(pluginContext);
    return plugin.getTools();
  }

  /**
   * Get available tools from the curated set
   */
  getAvailableTools(): string[] {
    const curatedTools = this.getCuratedTools();
    return curatedTools.map(tool => tool.name);
  }

  /**
   * Execute a specific tool directly
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    if (!this.isInitialized || !this.agentKit) {
      throw new Error('Agent kit not initialized');
    }

    try {
      const tools = this.agentKit.getAggregatedLangChainTools();
      const tool = tools.find(t => t.name === toolName);
      
      if (!tool) {
        throw new Error(`Tool "${toolName}" not found`);
      }

      console.log(`🔧 Executing tool: ${toolName}`);
      const result = await tool.invoke(parameters);
      console.log('✅ Tool execution result:', result);
      
      return result;
    } catch (error) {
      console.error(`❌ Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Generate helpful suggestions for user interactions
   */
  generateSuggestions(userContext?: { isVerified?: boolean; hasBalance?: boolean }): string[] {
    const suggestions = [
      "What's my HBAR balance?",
      "Create a new topic for storing messages",
      "Submit a message to the CucumberMoped topic",
      "Show me recent messages from our topic",
    ];

    if (userContext?.isVerified) {
      suggestions.push(
        "Transfer 1 HBAR to account 0.0.123456",
        "Create a new token with symbol CMPED",
        "Schedule a transfer for tomorrow"
      );
    }

    if (userContext?.hasBalance) {
      suggestions.push(
        "Get my trading portfolio allocation",
        "Submit my portfolio to Hedera for storage"
      );
    }

    return suggestions;
  }

  /**
   * Get agent capabilities description
   */
  getCapabilities(): string {
    return `
🤖 **Hedera AI Agent Capabilities**

**Core Hedera Operations:**
• Account management (create, update, delete)
• HBAR transfers and allowances
• Token operations (HTS) - create, mint, transfer, burn
• NFT operations - create collections, mint, transfer
• Consensus Service (HCS) - topics and messages
• File operations - create, update, delete
• Smart contract deployment and execution

**CucumberMoped Integration:**
• Portfolio analysis and recommendations
• Trading volume tracking
• Strategy calculations with Black-Litterman
• Merit eligibility checking
• Hedera topic management for data storage

**Interaction Modes:**
• Natural language processing
• Direct tool execution
• Scheduled transactions
• Transaction preparation for user signing

**Examples:**
• "Transfer 10 HBAR to account 0.0.123456"
• "Create a new token called CucumberCoin"
• "Submit my portfolio allocation to our Hedera topic"
• "What tokens do I own?"
• "Schedule a payment for next week"
    `.trim();
  }

  /**
   * Clean shutdown
   */
  async shutdown(): Promise<void> {
    if (this.conversationalAgent) {
      // Note: The agent kit doesn't have explicit shutdown methods
      // but we can clean up our references
      this.conversationalAgent = undefined;
      this.agentKit = undefined;
      this.signer = undefined;
      this.llm = undefined;
      this.isInitialized = false;
      console.log('🤖 Hedera Agent Service shut down');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {
      initialized: this.isInitialized,
      hasAgent: !!this.conversationalAgent,
      hasKit: !!this.agentKit,
      hasSigner: !!this.signer,
      hasLLM: !!this.llm,
      network: this.config.network,
      operatorAccount: this.config.operatorAccountId
    };

    try {
      if (this.isInitialized) {
        details.availableTools = this.getCuratedTools().length;
      }

      // Test Hedera connectivity
      if (this.hederaService) {
        details.hederaConnectivity = await this.hederaService.testConnectivity();
      }

      const isHealthy = this.isInitialized && 
                       !!this.conversationalAgent && 
                       !!this.signer;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        details
      };

    } catch (error) {
      details.error = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'unhealthy',
        details
      };
    }
  }
} 