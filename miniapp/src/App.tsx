import React, { useState, useEffect } from 'react'
import { IDKitWidget } from '@worldcoin/idkit'
import './types/telegram.d.ts'

// Configuration
const WORLD_ID_APP_ID = import.meta.env.VITE_WORLDID_APP_ID
const WORLD_ID_ACTION = import.meta.env.VITE_WORLDID_ACTION

interface VerificationResult {
  success: boolean
  proof?: any
  error?: string
}

function App() {
  const [isVerified, setIsVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)

  useEffect(() => {
    // Initialize Telegram Web App
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp
      setUser(tg.initDataUnsafe.user)
      
      // Apply Telegram theme
      if (tg.themeParams.bg_color) {
        document.body.style.backgroundColor = tg.themeParams.bg_color
      }
      if (tg.themeParams.text_color) {
        document.body.style.color = tg.themeParams.text_color
      }
    }
    
    setIsLoading(false)
  }, [])

  const handleVerificationSuccess = async (result: any) => {
    console.log('World ID verification successful:', result)
    
    try {
      // Send verification to backend
      const response = await fetch('/api/verify-worldid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          proof: result,
          action: WORLD_ID_ACTION
        })
      })
      
      const verification = await response.json()
      
      if (verification.success) {
        setIsVerified(true)
        setVerificationResult({ success: true, proof: result })
        
        // Show success in Telegram
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.MainButton.setText('Verification Complete!')
          window.Telegram.WebApp.MainButton.show()
          
          setTimeout(() => {
            window.Telegram?.WebApp.close()
          }, 2000)
        }
      } else {
        setVerificationResult({ success: false, error: verification.error })
      }
    } catch (error) {
      console.error('Verification error:', error)
      setVerificationResult({ success: false, error: 'Failed to verify with backend' })
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Error</h2>
        <p>This app must be opened from Telegram.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        🥒 CucumberMoped
      </h1>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <p>Welcome, {user.first_name}!</p>
      </div>

      {!isVerified ? (
        <div>
          <h2>🌍 World ID Verification</h2>
          <p style={{ marginBottom: '20px' }}>
            To use the trading bot, you need to verify your humanity with World ID.
          </p>
          
          <div style={{ marginBottom: '20px' }}>
            <h3>What is World ID?</h3>
            <ul style={{ textAlign: 'left' }}>
              <li>Proves you're a unique human</li>
              <li>Privacy-preserving verification</li>
              <li>No personal data required</li>
              <li>One verification per person globally</li>
            </ul>
          </div>

          <div style={{ textAlign: 'center' }}>
            <IDKitWidget
              app_id={WORLD_ID_APP_ID}
              action={WORLD_ID_ACTION}
              // signal={user.id.toString()} // Temporarily remove signal to test
              onSuccess={handleVerificationSuccess}
              onError={(error) => {
                console.error('World ID error:', error)
                setVerificationResult({ success: false, error: error.message })
              }}
            >
              {({ open }) => (
                <button
                  onClick={open}
                  style={{
                    backgroundColor: '#007AFF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  🌍 Verify with World ID
                </button>
              )}
            </IDKitWidget>
          </div>
          
          {verificationResult && !verificationResult.success && (
            <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#ffebee', borderRadius: '8px' }}>
              <p style={{ color: '#c62828', margin: 0 }}>
                ❌ {verificationResult.error}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#e8f5e8', borderRadius: '8px' }}>
            <h2>✅ Verified!</h2>
            <p>You are now verified with World ID and can use all trading features.</p>
          </div>
          
          <p>Return to the bot chat to start trading!</p>
          
          <button
            onClick={() => window.Telegram?.WebApp.close()}
            style={{
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '16px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            🚀 Start Trading
          </button>
        </div>
      )}
    </div>
  )
}

export default App 