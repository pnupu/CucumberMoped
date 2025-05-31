/**
 * Mini App Server
 * Serves the Telegram Mini App and handles World ID verification API
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { DatabaseService } from '../services/DatabaseService';
import { WorldIdService } from '../services/WorldIdService';

export class MiniAppServer {
  private app: express.Application;
  private db: DatabaseService;
  private worldIdService: WorldIdService;

  constructor(db: DatabaseService, worldIdService: WorldIdService) {
    this.app = express();
    this.db = db;
    this.worldIdService = worldIdService;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS for Telegram Mini App
    this.app.use(cors({
      origin: ['https://web.telegram.org', 'https://k.web.telegram.org'],
      credentials: true
    }));
    
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../miniapp/dist')));
  }

  private setupRoutes(): void {
    // World ID verification API
    this.app.post('/api/verify-worldid', async (req: Request, res: Response): Promise<void> => {
      try {
        const { userId, proof, action } = req.body;

        if (!userId || !proof) {
          res.status(400).json({
            success: false,
            error: 'Missing userId or proof'
          });
          return;
        }

        console.log(`🌍 Processing World ID verification for user ${userId}`);
        console.log(`📝 Proof received:`, proof);

        // Verify the proof with World ID API
        const verificationResult = await this.worldIdService.verifyProof(proof, userId);

        if (verificationResult.success) {
          console.log(`✅ User ${userId} successfully verified via Mini App`);
          
          res.json({
            success: true,
            message: 'Verification successful'
          });
        } else {
          console.log(`❌ Verification failed for user ${userId}: ${verificationResult.error}`);
          
          res.status(400).json({
            success: false,
            error: verificationResult.error
          });
        }

      } catch (error) {
        console.error('Error in World ID verification API:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Check verification status
    this.app.get('/api/verify-status/:userId', async (req: Request, res: Response): Promise<void> => {
      try {
        const { userId } = req.params;

        if (!userId) {
          res.status(400).json({
            success: false,
            error: 'Missing userId'
          });
          return;
        }

        const isVerified = await this.worldIdService.isUserVerified(parseInt(userId));

        res.json({
          success: true,
          verified: isVerified
        });

      } catch (error) {
        console.error('Error checking verification status:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Serve the Mini App
    this.app.get('*', (req: Request, res: Response): void => {
      res.sendFile(path.join(__dirname, '../../miniapp/dist/index.html'));
    });
  }

  public start(port: number = 3001): void {
    this.app.listen(port, () => {
      console.log(`🚀 Mini App server running on port ${port}`);
      console.log(`📱 Mini App URL: http://localhost:${port}`);
    });
  }
} 