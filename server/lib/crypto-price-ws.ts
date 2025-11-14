import WebSocket from 'ws';

export interface CryptoPrices {
  bitcoin: string;
  solana: string;
  litecoin: string;
  tether: string; // USDT
}

export class CryptoPriceService {
  private coinCapWs: WebSocket | null = null;
  private currentPrices: Partial<CryptoPrices> = {};
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.isConnecting || (this.coinCapWs && this.coinCapWs.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    console.log('[CryptoPriceService] Connecting to CoinCap WebSocket...');

    // Connect to CoinCap WebSocket for real-time prices
    this.coinCapWs = new WebSocket('wss://ws.coincap.io/prices?assets=bitcoin,solana,litecoin,tether');

    this.coinCapWs.on('open', () => {
      console.log('[CryptoPriceService] Connected to CoinCap WebSocket');
      this.isConnecting = false;
      
      // Clear any reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    });

    this.coinCapWs.on('message', (data: WebSocket.Data) => {
      try {
        const prices = JSON.parse(data.toString()) as Partial<CryptoPrices>;
        
        // Update current prices
        this.currentPrices = {
          ...this.currentPrices,
          ...prices
        };
        
        // Log price updates (optional, can be removed in production)
        if (Object.keys(prices).length > 0) {
          console.log('[CryptoPriceService] Price update:', prices);
        }
      } catch (error) {
        console.error('[CryptoPriceService] Error parsing message:', error);
      }
    });

    this.coinCapWs.on('error', (error) => {
      console.error('[CryptoPriceService] WebSocket error:', error.message);
      this.isConnecting = false;
    });

    this.coinCapWs.on('close', () => {
      console.log('[CryptoPriceService] Connection closed. Reconnecting in 5 seconds...');
      this.isConnecting = false;
      this.coinCapWs = null;
      
      // Reconnect after 5 seconds
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, 5000);
    });
  }

  public getCurrentPrices(): Partial<CryptoPrices> {
    return this.currentPrices;
  }

  public disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.coinCapWs) {
      this.coinCapWs.close();
      this.coinCapWs = null;
    }
  }
}

// Singleton instance
let priceService: CryptoPriceService | null = null;

export function getCryptoPriceService(): CryptoPriceService {
  if (!priceService) {
    priceService = new CryptoPriceService();
  }
  return priceService;
}
