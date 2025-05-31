const { DynamicStructuredTool } = require('@langchain/core/tools');
const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');

/**
 * CucumberMoped Plugin for Hedera Agent Kit
 * Provides trading, strategy, and portfolio management tools
 */
class CucumberMopedPlugin {
  constructor(context) {
    this.id = 'cucumbermoped-plugin';
    this.name = 'CucumberMoped Trading Plugin';
    this.description = 'Provides trading, strategy, and portfolio management tools for CucumberMoped';
    this.version = '1.0.0';
    this.author = 'CucumberMoped Team';
    this.context = context || {};
  }

  getTools() {
    const tools = [];
    
    console.log('🥒 [PLUGIN] Starting getTools() method...');

    // IMPORTANT: Portfolio Bridge Tool - Using base Tool class to bypass schema validation issues
    try {
      console.log('🥒 [PLUGIN] Creating get_user_portfolio_summary tool...');
      
      class PortfolioSummaryTool extends Tool {
        constructor(context) {
          super();
          this.name = 'get_user_portfolio_summary';
          this.description = 'Get comprehensive portfolio information for a CucumberMoped user. Use this when users ask about "my portfolio", "portfolio status", "what do I own", or "portfolio summary". This covers both trading balances and AI-calculated allocations.';
          this.context = context;
        }

        async _call(input) {
          try {
            console.log(`🥒 [PORTFOLIO TOOL] Called with input:`, input);
            
            // Use userContext from plugin instead of parsing input
            const userContext = this.context.userContext;
            console.log(`🥒 [PORTFOLIO TOOL] User context:`, userContext);
            
            if (!userContext || !userContext.userId) {
              return `Error: No user context available. Please make sure you're logged in and try again.`;
            }

            const userId = userContext.userId;
            console.log(`🥒 [PORTFOLIO TOOL] Processing for userId: ${userId}`);
            
            let result = '📊 **Your CucumberMoped Portfolio Summary**\n\n';

            // Get user information
            if (this.context.db) {
              try {
                console.log(`🥒 [PORTFOLIO TOOL] Fetching user ${userId} from database...`);
                const user = await this.context.db.getUser(userId);
                if (user) {
                  console.log(`🥒 [PORTFOLIO TOOL] User found: ${user.walletAddress}`);
                  result += `👤 **Account:** ${user.walletAddress}\n`;
                  result += `🌍 **Verified:** ${user.worldIdVerified ? 'Yes ✅' : 'No ❌'}\n\n`;

                  // Get trading balances
                  console.log(`🥒 [PORTFOLIO TOOL] Fetching balances for user ${userId}...`);
                  const balances = await this.context.db.getTokenBalances(userId);
                  console.log(`🥒 [PORTFOLIO TOOL] Found ${balances.length} balances`);
                  if (balances.length > 0) {
                    result += `💰 **Your Trading Balances:**\n`;
                    for (const balance of balances) {
                      result += `• ${balance.tokenSymbol}: ${balance.balance}\n`;
                    }
                    result += '\n';
                  } else {
                    result += `💰 **Trading Balances:** No activity yet - use /balance to check wallet\n\n`;
                  }
                } else {
                  console.log(`🥒 [PORTFOLIO TOOL] User ${userId} not found in database`);
                  result += `⚠️ User ${userId} not found. Please use /start to register.\n\n`;
                }
              } catch (error) {
                console.error(`🥒 [PORTFOLIO TOOL] Error retrieving user info:`, error);
                result += `⚠️ Error retrieving user info: ${error instanceof Error ? error.message : 'Unknown'}\n\n`;
              }
            } else {
              console.log(`🥒 [PORTFOLIO TOOL] No database context available`);
              result += `⚠️ Database not available.\n\n`;
            }

            // Get AI portfolio allocations if available
            if (this.context.strategyService) {
              try {
                console.log(`🥒 [PORTFOLIO TOOL] Fetching AI portfolio allocations...`);
                result += `🧠 **AI-Recommended Allocations (Black-Litterman):**\n\n`;
                const { portfolio } = await this.context.strategyService.getPortfolioAllocation();
                console.log(`🥒 [PORTFOLIO TOOL] Got ${portfolio.allocations.length} allocations`);
                
                // Show top 5 allocations
                const topAllocations = portfolio.allocations
                  .sort((a, b) => b.allocation - a.allocation)
                  .slice(0, 5);
                
                for (const allocation of topAllocations) {
                  const percentage = (allocation.allocation * 100).toFixed(1);
                  result += `• ${allocation.symbol}: ${percentage}%\n`;
                }
                
                result += `\n📊 Total Market Cap: $${(portfolio.totalMarketCap / 1e9).toFixed(1)}B\n\n`;
              } catch (error) {
                console.error(`🥒 [PORTFOLIO TOOL] Error getting AI allocations:`, error);
                result += `⚠️ AI allocations temporarily unavailable: ${error instanceof Error ? error.message : 'Unknown'}\n\n`;
              }
            } else {
              console.log(`🥒 [PORTFOLIO TOOL] No strategy service available`);
              result += `⚠️ AI portfolio service not available\n\n`;
            }

            result += `💡 **Next Steps:**\n`;
            result += `• Use "/balance" to check your wallet across all chains\n`;
            result += `• Use "/ai get my full portfolio allocation" for detailed AI analysis\n`;
            result += `• Use "/quote [amount] [token1] [token2]" to get trading quotes\n`;

            console.log(`🥒 [PORTFOLIO TOOL] Returning result: ${result.length} characters`);
            return result;
          } catch (error) {
            console.error(`🥒 [PORTFOLIO TOOL] Fatal error:`, error);
            return `Error retrieving portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        }
      }
      
      const portfolioTool = new PortfolioSummaryTool(this.context);
      tools.push(portfolioTool);
      console.log('🥒 [PLUGIN] ✅ Successfully created get_user_portfolio_summary tool');
    } catch (error) {
      console.error('🥒 [PLUGIN] ❌ Error creating get_user_portfolio_summary tool:', error);
    }

    // Only add tools if we have the required services
    if (this.context.strategyService) {
      tools.push(
        // Portfolio Strategy Tools
        new DynamicStructuredTool({
          name: 'get_portfolio_allocation',
          description: 'Calculate detailed AI-optimized portfolio allocation using Black-Litterman optimization. Use this for specific requests about "allocation calculations", "optimization strategy", "detailed portfolio analysis", or "Black-Litterman". NOT for general "my portfolio" questions.',
          schema: z.object({
            recalculate: z.boolean().optional().describe('Whether to force recalculation instead of using cached data')
          }),
          func: async ({ recalculate = false }) => {
            try {
              const { portfolio } = await this.context.strategyService.getPortfolioAllocation();
              
              const overview = this.context.strategyService.createIndexOverview(portfolio, recalculate);
              const chart = this.context.strategyService.generateAllocationChart(portfolio);
              
              return `${overview}\n\n\`\`\`\n${chart}\n\`\`\``;
            } catch (error) {
              return `Error calculating portfolio allocation: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
          },
        })
      );

      if (this.context.hederaService) {
        tools.push(
          new DynamicStructuredTool({
            name: 'submit_portfolio_to_hedera',
            description: 'Submit the current portfolio allocation to Hedera Consensus Service topic',
            schema: z.object({
              topicId: z.string().describe('Hedera topic ID to submit to (e.g. 0.0.6089779)')
            }),
            func: async ({ topicId }) => {
              try {
                const { hederaMessage } = await this.context.strategyService.getPortfolioAllocation();
                
                // Check if message needs to be split
                const maxMessageSize = 1024;
                
                if (hederaMessage.length > maxMessageSize) {
                  // Split message into chunks
                  const chunks = [];
                  for (let i = 0; i < hederaMessage.length; i += maxMessageSize) {
                    chunks.push(hederaMessage.slice(i, i + maxMessageSize));
                  }

                  const sequenceNumbers = [];
                  for (let i = 0; i < chunks.length; i++) {
                    const sequence = await this.context.hederaService.submitMessage(topicId, chunks[i]);
                    sequenceNumbers.push(sequence);
                    
                    // Wait between messages
                    if (i < chunks.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                  }

                  return `Portfolio allocation submitted to topic ${topicId} in ${chunks.length} parts. Sequence numbers: ${sequenceNumbers.join(', ')}`;
                } else {
                  const sequence = await this.context.hederaService.submitMessage(topicId, hederaMessage);
                  return `Portfolio allocation submitted to topic ${topicId} with sequence number: ${sequence}`;
                }
              } catch (error) {
                return `Error submitting to Hedera: ${error instanceof Error ? error.message : 'Unknown error'}`;
              }
            },
          })
        );
      }
    }

    // Hedera Topic Management Tools
    if (this.context.hederaService) {
      tools.push(
        new DynamicStructuredTool({
          name: 'create_hedera_topic',
          description: 'Create a new Hedera Consensus Service topic',
          schema: z.object({
            memo: z.string().describe('Memo/description for the topic')
          }),
          func: async ({ memo }) => {
            try {
              const topicId = await this.context.hederaService.createTopic(memo);
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
          func: async ({ topicId, limit = 10 }) => {
            try {
              const messages = await this.context.hederaService.getAllTopicMessages(topicId, { 
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
          func: async ({ topicId, message }) => {
            try {
              const sequence = await this.context.hederaService.submitMessage(topicId, message);
              return `Message submitted to topic ${topicId} with sequence number: ${sequence}`;
            } catch (error) {
              return `Error submitting message: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
          },
        }),

        new DynamicStructuredTool({
          name: 'get_hedera_testnet_info',
          description: 'Get information about Hedera testnet connectivity and status',
          schema: z.object({}),
          func: async () => {
            try {
              const isConnected = await this.context.hederaService.testConnectivity();
              
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
      );
    }

    // User Management Tools
    if (this.context.db) {
      tools.push(
        new DynamicStructuredTool({
          name: 'get_user_info',
          description: 'Get information about the current Telegram user from the database',
          schema: z.object({}),
          func: async () => {
            try {
              const userContext = this.context.userContext;
              if (!userContext || !userContext.userId) {
                return `Error: No user context available. Please make sure you're logged in.`;
              }

              const userId = userContext.userId;
              const user = await this.context.db.getUser(userId);
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
          description: 'Check if the current user is eligible for merit distribution',
          schema: z.object({}),
          func: async () => {
            try {
              const userContext = this.context.userContext;
              if (!userContext || !userContext.userId) {
                return `Error: No user context available. Please make sure you're logged in.`;
              }

              const userId = userContext.userId;
              const user = await this.context.db.getUser(userId);
              if (!user) {
                return `User ${userId} not found`;
              }

              // Simple eligibility check - in production this would use MeritEligibilityService
              const balances = await this.context.db.getTokenBalances(userId);
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
        })
      );
    }

    // General Information Tools
    tools.push(
      new DynamicStructuredTool({
        name: 'get_cucumbermoped_info',
        description: 'Get general information about the CucumberMoped trading bot',
        schema: z.object({}),
        func: async () => {
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

**Available Custom Tools:**
${toolNames}

**Key Features:**
• Trade tokens across Ethereum, Base, Arbitrum, and Polygon
• Get AI-optimized portfolio allocations
• Store and retrieve data on Hedera
• Merit-based reward distribution for verified traders

Ask me anything about portfolio management, Hedera operations, or trading!`;
        },
      })
    );

    console.log(`🥒 CucumberMoped Plugin loaded ${tools.length} tools`);
    return tools;
  }
}

module.exports = { CucumberMopedPlugin }; 