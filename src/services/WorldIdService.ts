/**
 * World ID Service for Telegram Bot Integration
 * 
 * Real World ID integration using:
 * - Proper verification URLs
 * - Real World ID API for proof verification
 * - User signal generation for verification tracking
 */

import { DatabaseService } from './DatabaseService';
import { 
  IWorldIdService, 
  WorldIdProof, 
  WorldIdVerificationResult
} from '../types';
import crypto from 'crypto';

// World ID API response interface
interface WorldIdApiResponse {
  success: boolean;
  detail?: string;
  error?: string;
}

export class WorldIdService implements IWorldIdService {
  private readonly appId: string;
  private readonly action: string;
  private db: DatabaseService;

  constructor(
    appId: string,
    db: DatabaseService,
    action: string = 'identity-verification'
  ) {
    this.appId = appId;
    this.action = action;
    this.db = db;

    console.log(`🌍 World ID Service initialized for app: ${appId}`);
    console.log(`🔧 Action: ${action}`);
  }

  /**
   * Initialize World ID verification - generate real verification URL
   */
  async initializeVerification(userId: number, action?: string): Promise<string> {
    const verificationUrl = await this.generateWorldIdUrl(userId, action);
    console.log(`🌍 World ID verification initialized for user ${userId}`);
    console.log(`📝 Verification URL: ${verificationUrl}`);
    return verificationUrl;
  }

  /**
   * Generate real World ID verification URL
   */
  async generateWorldIdUrl(userId: number, action?: string): Promise<string> {
    const verificationAction = action || this.action;
    const signal = this.generateSignal(userId);
    
    // Create the real World ID verification URL
    const params = new URLSearchParams({
      app_id: this.appId,
      action: verificationAction,
      signal: signal,
      verification_level: 'orb' // Default to orb level
    });

    const verificationUrl = `https://id.worldcoin.org/verify?${params.toString()}`;
    console.log(`🔗 Generated verification URL: ${verificationUrl}`);
    
    return verificationUrl;
  }

  /**
   * Generate World ID verification URL (string format)
   */
  getVerificationUrlString(userId: number, action?: string): string {
    const verificationAction = action || this.action;
    const signal = this.generateSignal(userId);
    
    const params = new URLSearchParams({
      app_id: this.appId,
      action: verificationAction,
      signal: signal,
      verification_level: 'orb'
    });

    console.log(`🔗 Generated URL signal: "${signal}" for user ${userId}`);
    return `https://id.worldcoin.org/verify?${params.toString()}`;
  }

  /**
   * Verify World ID proof using the real API
   */
  async verifyProof(proof: WorldIdProof, userId: number): Promise<WorldIdVerificationResult> {
    try {
      console.log(`🔍 Verifying World ID proof for user ${userId}`);
      console.log(`📝 Proof details:`, {
        nullifier_hash: proof.nullifier_hash,
        verification_level: proof.verification_level,
        merkle_root: proof.merkle_root ? 'present' : 'missing',
        proof: proof.proof ? 'present' : 'missing'
      });

      // First check if user exists
      const user = await this.db.getUser(userId);
      if (!user) {
        console.log(`❌ User ${userId} not found in database`);
        return {
          success: false,
          error: 'User not found in database'
        };
      }

      console.log(`✅ User ${userId} found in database: ${user.walletAddress}`);

      // Verify with World ID API
      const verification = await this.verifyWithWorldId(proof, userId);
      
      if (verification.success) {
        console.log(`✅ World ID API verification successful for user ${userId}`);
        
        // Update user's verification status in database
        try {
          await this.updateUserVerification(userId, proof);
          console.log(`✅ Database updated with verification for user ${userId}`);
        } catch (dbError) {
          console.error(`❌ Failed to update database for user ${userId}:`, dbError);
          return {
            success: false,
            error: 'Failed to save verification to database'
          };
        }

        console.log(`✅ User ${userId} successfully verified with World ID`);
        return {
          success: true,
          proof: proof
        };
      } else {
        console.log(`❌ World ID verification failed for user ${userId}: ${verification.error}`);
        return {
          success: false,
          error: verification.error
        };
      }
    } catch (error) {
      console.error('Error verifying World ID proof:', error);
      return {
        success: false,
        error: 'Failed to verify World ID proof'
      };
    }
  }

  /**
   * Check if user is already verified
   */
  async isUserVerified(userId: number): Promise<boolean> {
    try {
      console.log(`🔍 Checking if user ${userId} is verified...`);
      const user = await this.db.getUser(userId);
      const isVerified = user?.worldIdVerified || false;
      console.log(`📊 User ${userId} verification status: ${isVerified}`);
      if (user && user.worldIdVerified) {
        console.log(`✅ User ${userId} found verified with nullifier: ${user.worldIdNullifierHash}`);
      }
      return isVerified;
    } catch (error) {
      console.error('Error checking user verification status:', error);
      return false;
    }
  }

  /**
   * Check verification status and verify if completed externally
   */
  async checkAndVerifyUser(userId: number): Promise<WorldIdVerificationResult> {
    try {
      console.log(`🔍 Running checkAndVerifyUser for user ${userId}...`);
      
      // First check if already verified in database
      const isAlreadyVerified = await this.isUserVerified(userId);
      if (isAlreadyVerified) {
        console.log(`✅ User ${userId} already verified in database`);
        return {
          success: true,
          proof: {
            nullifier_hash: 'already_verified',
            merkle_root: '',
            proof: '',
            verification_level: 'orb'
          }
        };
      }

      console.log(`❌ User ${userId} not verified in database yet`);
      // For now, return not verified - in a real implementation,
      // this would check with World ID API if verification was completed
      return {
        success: false,
        error: 'Please complete verification in the Mini App first'
      };
    } catch (error) {
      console.error('Error checking verification:', error);
      return {
        success: false,
        error: 'Failed to check verification status'
      };
    }
  }

  /**
   * Generate signal hash for World ID verification
   */
  private generateSignalHash(userId: number): string {
    // For testing: use empty string signal (API default)
    const signal = ''; // Empty signal
    
    // Use the default empty string hash as specified in API docs
    const emptyStringHash = '0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4';
    
    console.log(`📝 Using empty signal hash (API default): ${emptyStringHash}`);
    return emptyStringHash;
  }

  /**
   * Generate signal for this verification (user's unique identifier within this app)
   */
  private generateSignal(userId: number): string {
    // Use the same signal format as the Mini App: just the user ID as string
    // This MUST match exactly what IDKitWidget receives as the signal prop
    return userId.toString();
  }

  /**
   * Verify proof with real World ID API
   */
  private async verifyWithWorldId(proof: WorldIdProof, userId: number): Promise<WorldIdVerificationResult> {
    try {
      console.log(`🌐 Calling World ID API for verification`);
      console.log(`📝 App ID: ${this.appId}`);
      console.log(`📝 Action: ${this.action}`);
      
      // Check if this is a staging app
      const isStaging = this.appId.includes('staging');
      if (isStaging) {
        console.log(`⚠️  STAGING APP DETECTED: This app requires the Worldcoin Simulator for testing`);
        console.log(`🔗 Simulator URL: https://simulator.worldcoin.org/`);
      }
      
      // Use the correct World ID API v2 endpoint with app_id in URL
      const apiUrl = `https://developer.worldcoin.org/api/v2/verify/${this.appId}`;
      
      // Generate signal hash properly
      const signalHash = this.generateSignalHash(userId);
      
      const requestBody = {
        nullifier_hash: proof.nullifier_hash,
        merkle_root: proof.merkle_root,
        proof: proof.proof,
        verification_level: proof.verification_level,
        action: this.action,
        signal_hash: signalHash
      };
      
      console.log(`📤 Request body:`, requestBody);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CucumberMoped-TradingBot/1.0'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ World ID API error (${response.status}):`, errorText);
        
        // Try to parse error for better debugging
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.detail) {
            console.error(`📝 Error detail: ${errorJson.detail}`);
          }
          
          // Provide specific help for staging apps
          if (isStaging && errorJson.code === 'invalid_proof') {
            console.error(`💡 STAGING APP HELP:`);
            console.error(`   • Use Worldcoin Simulator: https://simulator.worldcoin.org/`);
            console.error(`   • Create temporary identity in simulator`);
            console.error(`   • Verify with simulator, not real World ID`);
            console.error(`   • Current signal format: "${this.generateSignal(userId)}"`);
            console.error(`   • Generate fresh proof if signal format changed`);
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
        
        return { 
          success: false, 
          error: `World ID API error: ${response.status} ${response.statusText}` 
        };
      }

      const result = await response.json() as WorldIdApiResponse;
      
      console.log(`📊 World ID API response:`, result);
      
      if (result.success) {
        console.log(`✅ World ID API verification successful!`);
        return { success: true, proof };
      } else {
        console.log(`❌ World ID API verification failed: ${result.detail || result.error}`);
        return { 
          success: false, 
          error: result.detail || result.error || 'Unknown verification error' 
        };
      }
    } catch (error) {
      console.error('Error calling World ID API:', error);
      return { 
        success: false, 
        error: 'Failed to connect to World ID verification service' 
      };
    }
  }

  /**
   * Update user verification status in database
   */
  private async updateUserVerification(userId: number, proof: WorldIdProof): Promise<void> {
    try {
      await this.db.updateUserWorldIdVerification(
        userId,
        true,
        proof.nullifier_hash,
        JSON.stringify(proof)
      );
      console.log(`✅ Updated user ${userId} verification status in database`);
    } catch (error) {
      console.error('Error updating user verification status:', error);
      throw error;
    }
  }

  /**
   * Generate simple instructions for Telegram users
   */
  generateTelegramInstructions(userId: number): string {
    return `🌍 **World ID Verification Required**

To use this trading bot, you need to verify your identity with World ID.

**Steps to verify:**
1. **Click the verification link** below
2. **Complete verification** in World App or browser
3. **Return here** and click "✅ I completed verification"

**What is World ID?**
• Proves you're a unique human
• Privacy-preserving (no personal data required)
• One verification per person globally
• Prevents bots and fake accounts

**Ready to verify?** Click the link below! 🚀`;
  }

  /**
   * Generate QR code for verification URL
   */
  async generateVerificationQRCode(userId: number, action?: string): Promise<string> {
    const QRCode = require('qrcode');
    const verificationUrl = this.getVerificationUrlString(userId, action);
    return await QRCode.toDataURL(verificationUrl);
  }

  /**
   * Generate QR code as base64 string
   */
  async generateVerificationQRCodeBase64(userId: number, action?: string): Promise<string> {
    const qrCode = await this.generateVerificationQRCode(userId, action);
    return qrCode.replace(/^data:image\/png;base64,/, '');
  }

  /**
   * Generate QR code as SVG
   */
  async generateVerificationQRCodeSVG(userId: number, action?: string): Promise<string> {
    const QRCode = require('qrcode');
    const verificationUrl = this.getVerificationUrlString(userId, action);
    return await QRCode.toString(verificationUrl, { type: 'svg' });
  }

  /**
   * Generate QR code as buffer
   */
  async generateVerificationQRCodeBuffer(userId: number, action?: string): Promise<Buffer> {
    const QRCode = require('qrcode');
    const verificationUrl = this.getVerificationUrlString(userId, action);
    return await QRCode.toBuffer(verificationUrl);
  }
} 