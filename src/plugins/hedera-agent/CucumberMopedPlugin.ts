import {
  GenericPlugin,
  GenericPluginContext,
} from '@hashgraphonline/standards-agent-kit';
import { StructuredTool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { HederaService } from '../../services/HederaService';
import { StrategyService } from '../../services/StrategyService';
import { PrismaDatabaseService } from '../../services/PrismaDatabaseService';
import { WalletService } from '../../services/WalletService';
import { TelegramBotService } from '../../services/TelegramBotService';

export interface CucumberMopedPluginConfig {
  hederaService: HederaService;
  strategyService: StrategyService;
  db: PrismaDatabaseService;
  walletService: WalletService;
  telegramService: TelegramBotService;
}

/**
 * CucumberMoped Plugin for Hedera Agent Kit
 * Provides trading, strategy, and portfolio management tools
 */
export class CucumberMopedPlugin extends GenericPlugin {
  id = 'cucumbermoped-plugin';
  name = 'CucumberMoped Trading Plugin';
  description = 'Provides trading, strategy, and portfolio management tools for CucumberMoped';
  version = '1.0.0';
  author = 'CucumberMoped Team';
  namespace = 'cucumbermoped';

  private services?: CucumberMopedPluginConfig;

  override async initialize(context: GenericPluginContext): Promise<void> {
    await super.initialize(context);
    
    // Extract our services from the context's config
    this.services = context.config as unknown as CucumberMopedPluginConfig;
    
    if (!this.services) {
      throw new Error('CucumberMoped services not provided in plugin config');
    }

    this.context.logger.info('CucumberMoped Plugin initialized successfully');
  }

  getTools(): StructuredTool[] {
    if (!this.services) {
      throw new Error('Plugin not initialized - services not available');
    }

    const { hederaService, strategyService, db, walletService, telegramService } = this.services;

    return [
      // Portfolio Strategy Tools
      new DynamicStructuredTool({
        name: 'get_portfolio_allocation',
        description: 'Calculate and get the current Black-Litterman portfolio allocation for CucumberMoped index',
        schema: z.object({
          recalculate: z.boolean().optional().describe('Whether to force recalculation instead of using cached data')
        }),
        func: async ({ recalculate = false }): Promise<string> => {
          try {
            const { portfolio } = await strategyService.getPortfolioAllocation();
            
            const overview = strategyService.createIndexOverview(portfolio, recalculate);
            const chart = strategyService.generateAllocationChart(portfolio);
            
            return `${overview}\n\n\`\`\`\n${chart}\n\`\`\``;
          } catch (error) {
            return `Error calculating portfolio allocation: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'submit_portfolio_to_hedera',
        description: 'Submit the current portfolio allocation to Hedera Consensus Service topic',
        schema: z.object({
          topicId: z.string().describe('Hedera topic ID to submit to (e.g. 0.0.6089779)')
        }),
        func: async ({ topicId }): Promise<string> => {
          try {
            const { hederaMessage } = await strategyService.getPortfolioAllocation();
            
            // Check if message needs to be split
            const maxMessageSize = 1024;
            
            if (hederaMessage.length > maxMessageSize) {
              // Split message into chunks
              const chunks: string[] = [];
              for (let i = 0; i < hederaMessage.length; i += maxMessageSize) {
                chunks.push(hederaMessage.slice(i, i + maxMessageSize));
              }

              const sequenceNumbers: number[] = [];
              for (let i = 0; i < chunks.length; i++) {
                const sequence = await hederaService.submitMessage(topicId, chunks[i]);
                sequenceNumbers.push(sequence);
                
                // Wait between messages
                if (i < chunks.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }

              return `Portfolio allocation submitted to topic ${topicId} in ${chunks.length} parts. Sequence numbers: ${sequenceNumbers.join(', ')}`;
            } else {
              const sequence = await hederaService.submitMessage(topicId, hederaMessage);
              return `Portfolio allocation submitted to topic ${topicId} with sequence number: ${sequence}`;
            }
          } catch (error) {
            return `Error submitting to Hedera: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      // Hedera Topic Management Tools
      new DynamicStructuredTool({
        name: 'create_hedera_topic',
        description: 'Create a new Hedera Consensus Service topic',
        schema: z.object({
          memo: z.string().describe('Memo/description for the topic')
        }),
        func: async ({ memo }): Promise<string> => {
          try {
            const topicId = await hederaService.createTopic(memo);
            return `Successfully created Hedera topic with ID: ${topicId.toString()}`;
          } catch (error) {
            return `Error creating topic: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'get_topic_messages',
        description: 'Retrieve messages from a Hedera topic',
        schema: z.object({
          topicId: z.string().describe('Hedera topic ID (e.g. 0.0.123456)'),
          limit: z.number().optional().describe('Maximum number of messages to retrieve (default: 10)')
        }),
        func: async ({ topicId, limit = 10 }): Promise<string> => {
          try {
            const messages = await hederaService.getAllTopicMessages(topicId, { 
              limit,
              order: 'desc'
            });

            if (messages.length === 0) {
              return `No messages found in topic ${topicId}`;
            }

            let result = `Found ${messages.length} messages in topic ${topicId}:\n\n`;
            
            for (const message of messages) {
              const timestamp = message.consensusTimestamp.toISOString();
              const preview = message.contents.length > 100 
                ? message.contents.substring(0, 100) + '...'
                : message.contents;
              
              result += `Sequence ${message.sequenceNumber} (${timestamp}):\n${preview}\n\n`;
            }

            return result;
          } catch (error) {
            return `Error retrieving messages: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'submit_message_to_topic',
        description: 'Submit a message to a Hedera topic',
        schema: z.object({
          topicId: z.string().describe('Hedera topic ID (e.g. 0.0.123456)'),
          message: z.string().describe('Message content to submit')
        }),
        func: async ({ topicId, message }): Promise<string> => {
          try {
            const sequence = await hederaService.submitMessage(topicId, message);
            return `Message submitted to topic ${topicId} with sequence number: ${sequence}`;
          } catch (error) {
            return `Error submitting message: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      // User Management Tools
      new DynamicStructuredTool({
        name: 'get_user_info',
        description: 'Get information about a Telegram user from the database',
        schema: z.object({
          userId: z.number().describe('Telegram user ID')
        }),
        func: async ({ userId }): Promise<string> => {
          try {
            const user = await db.getUser(userId);
            if (!user) {
              return `User ${userId} not found in database`;
            }

            return `User Information:
• User ID: ${user.telegramId}
• Username: ${user.username || 'Not set'}
• Wallet Address: ${user.walletAddress}
• World ID Verified: ${user.worldIdVerified ? 'Yes' : 'No'}
• Created: ${user.createdAt.toISOString()}
• Last Updated: ${user.updatedAt.toISOString()}`;
          } catch (error) {
            return `Error retrieving user info: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'check_user_merit_eligibility',
        description: 'Check if a user is eligible for merit distribution',
        schema: z.object({
          userId: z.number().describe('Telegram user ID')
        }),
        func: async ({ userId }): Promise<string> => {
          try {
            // This would integrate with the merit eligibility service
            const user = await db.getUser(userId);
            if (!user) {
              return `User ${userId} not found`;
            }

            // Simple eligibility check - in production this would use MeritEligibilityService
            const balances = await db.getTokenBalances(userId);
            const hasActivity = balances.length > 0;

            return `Merit Eligibility for User ${userId}:
• World ID Verified: ${user.worldIdVerified ? 'Yes ✅' : 'No ❌'}
• Has Trading Activity: ${hasActivity ? 'Yes ✅' : 'No ❌'}
• Eligible: ${user.worldIdVerified && hasActivity ? 'Yes ✅' : 'No ❌'}

Note: Full eligibility checking requires the merit service to be active.`;
          } catch (error) {
            return `Error checking eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),

      // General Information Tools
      new DynamicStructuredTool({
        name: 'get_cucumbermoped_info',
        description: 'Get general information about the CucumberMoped trading bot',
        schema: z.object({}),
        func: async (): Promise<string> => {
          const tools = this.getTools();
          const toolNames = tools.map(t => t.name).join(', ');
          
          return `🥒 **CucumberMoped Trading Bot**

**What is CucumberMoped?**
A Telegram trading bot that combines:
• Cross-chain token trading via 1inch Fusion+
• AI-powered portfolio management with Black-Litterman optimization
• Hedera Consensus Service for decentralized data storage
• World ID verification for merit-based rewards
• Real-time price feeds from Pyth Network

**AI Agent Capabilities:**
The AI agent can help you with portfolio analysis, Hedera operations, user management, and more.

**Available Tools:**
${toolNames}

**Key Features:**
• Trade tokens across Ethereum, Base, Arbitrum, and Polygon
• Get AI-optimized portfolio allocations
• Store and retrieve data on Hedera
• Merit-based reward distribution for verified traders

Ask me anything about portfolio management, Hedera operations, or trading!`;
        },
      }),

      new DynamicStructuredTool({
        name: 'get_hedera_testnet_info',
        description: 'Get information about Hedera testnet connectivity and status',
        schema: z.object({}),
        func: async (): Promise<string> => {
          try {
            const isConnected = await hederaService.testConnectivity();
            
            return `Hedera Testnet Status:
• Connectivity: ${isConnected ? 'Connected ✅' : 'Disconnected ❌'}
• Network: Hedera Testnet
• Mirror Node: https://testnet.mirrornode.hedera.com
• Current Operator: Available

You can create topics, submit messages, and query data on the Hedera testnet.`;
          } catch (error) {
            return `Error checking Hedera status: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      })
    ];
  }
} 