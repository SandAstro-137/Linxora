interface CryptoPrice {
  usd: number;
  usd_24h_change: number;
}

export async function getCryptoPrices(): Promise<Record<string, CryptoPrice>> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether,solana,bitcoin,litecoin&vs_currencies=usd&include_24hr_change=true'
    );
    
    const data = await response.json();
    
    return {
      usdt: {
        usd: data.tether?.usd || 1,
        usd_24h_change: data.tether?.usd_24h_change || 0,
      },
      sol: {
        usd: data.solana?.usd || 0,
        usd_24h_change: data.solana?.usd_24h_change || 0,
      },
      btc: {
        usd: data.bitcoin?.usd || 0,
        usd_24h_change: data.bitcoin?.usd_24h_change || 0,
      },
      ltc: {
        usd: data.litecoin?.usd || 0,
        usd_24h_change: data.litecoin?.usd_24h_change || 0,
      },
    };
  } catch (error) {
    console.error('Failed to fetch crypto prices:', error);
    return {
      usdt: { usd: 1, usd_24h_change: 0 },
      sol: { usd: 0, usd_24h_change: 0 },
      btc: { usd: 0, usd_24h_change: 0 },
      ltc: { usd: 0, usd_24h_change: 0 },
    };
  }
}
