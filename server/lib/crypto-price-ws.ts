import { getCryptoPrices } from './coingecko';

export interface CryptoPrices {
  btc: number;
  sol: number;
  ltc: number;
  usdt: number;
}

export class CryptoPriceService {
  private currentPrices: CryptoPrices = { btc: 0, sol: 0, ltc: 0, usdt: 1.0 };
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor() {
    this.startPolling();
  }

  private async startPolling() {
    if (this.isPolling) return;
    
    this.isPolling = true;
    console.log('[CryptoPriceService] Starting price polling from CoinGecko...');
    
    // Fetch prices immediately
    await this.fetchPrices();
    
    // Poll every 10 seconds
    this.pollInterval = setInterval(() => {
      this.fetchPrices();
    }, 10000);
  }

  private async fetchPrices() {
    try {
      const prices = await getCryptoPrices();
      
      // Convert to simple format
      this.currentPrices = {
        btc: prices.btc?.usd || 0,
        sol: prices.sol?.usd || 0,
        ltc: prices.ltc?.usd || 0,
        usdt: prices.usdt?.usd || 1.0,
      };
      
      console.log('[CryptoPriceService] Prices updated:', this.currentPrices);
    } catch (error) {
      console.error('[CryptoPriceService] Error fetching prices:', error);
    }
  }

  public getCurrentPrices(): CryptoPrices {
    return this.currentPrices;
  }

  public disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
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
