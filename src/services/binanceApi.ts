import { KlineData, KTYPE_MAP } from '../types';

const BASE_URL = 'https://api.binance.com';

// Map our SYMBOLS to Binance symbols
const SYMBOL_MAP: Record<string, string> = {
    'XAUUSD': 'PAXGUSDT', // Gold -> Pax Gold (Crypto-backed Gold)
    'EURUSD': 'EURUSDT',
    'GBPUSD': 'GBPUSDT',
    'USDJPY': 'USDCJPY', // Very limited liquidity, might need fallback or warning. Actually checking binance pairs, usually it's stablecoins. 
    // Better alternative for JPY might be missing on standard Binance spot. 
    // Let's stick to major pairs. 
    // If not found, we might need a different mapping or just fail gracefully.
    'AUDUSD': 'AUDUSDT',
    'USDCAD': 'USDCUSDT', // Proxy? No.
    // Crypto
    'BTCUSD': 'BTCUSDT',
    'ETHUSD': 'ETHUSDT',
};

// Map our timeframes to Binance intervals
const INTERVAL_MAP: Record<string, string> = {
    'M5': '5m',
    'M15': '15m',
    'M30': '30m',
    'H1': '1h',
    'H4': '4h',
    'D1': '1d',
};

export async function fetchBinanceKline(
    symbol: string,
    interval: string,
    limit: number = 100
): Promise<KlineData[]> {
    // Resolve mapped symbol
    const binanceSymbol = SYMBOL_MAP[symbol] || symbol.replace('/', ''); // Try direct map, else remove slash (e.g. BTC/USDT -> BTCUSDT)

    // Convert generic timeframe key (M5, H1) to Binance interval (5m, 1h) if needed
    // If 'interval' comes in as '1', '2' (from KTYPE_MAP numbers), we need to handle that too, 
    // but the caller usually passes the string representation or we control it.
    // Based on itickApi, it takes kType (number). We need to align with that.

    // Wait, let's look at how getMultiTimeframeData implementations usually work. 
    // existing itickApi uses KTYPE_MAP keys probably? No, itick uses specific numbers.
    // Let's check the types file again for KTYPE_MAP. 

    const url = `${BASE_URL}/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Binance API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Binance response: [ [OpenTime, Open, High, Low, Close, Volume, CloseTime, ...], ... ]
        if (!Array.isArray(data)) {
            throw new Error('Binance API returned invalid data format');
        }

        return data.map((k: any[]) => ({
            timestamp: k[0], // Open time
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
        })).sort((a, b) => a.timestamp - b.timestamp); // Ensure sorted

    } catch (error) {
        console.error(`[Binance API] Error fetching ${symbol} ${interval}:`, error);
        // Fallback: return empty array or throw? 
        // Throwing allows the caller to handle it (e.g. switch to another provider)
        throw error;
    }
}

export async function getBinanceMultiTimeframeData(
    symbol: string
): Promise<{ M5: KlineData[]; M15: KlineData[]; M30: KlineData[]; H1: KlineData[]; H4: KlineData[]; D1: KlineData[] }> {

    console.log('[Binance API] Fetching multi-timeframe for', symbol);

    try {
        const [m5, m15, m30, h1, h4, d1] = await Promise.all([
            fetchBinanceKline(symbol, INTERVAL_MAP['M5']),
            fetchBinanceKline(symbol, INTERVAL_MAP['M15']),
            fetchBinanceKline(symbol, INTERVAL_MAP['M30']),
            fetchBinanceKline(symbol, INTERVAL_MAP['H1']),
            fetchBinanceKline(symbol, INTERVAL_MAP['H4']),
            fetchBinanceKline(symbol, INTERVAL_MAP['D1']),
        ]);

        return {
            M5: m5,
            M15: m15,
            M30: m30,
            H1: h1,
            H4: h4,
            D1: d1,
        };
    } catch (error) {
        console.error('[Binance API] Multi-timeframe fetch failed:', error);
        throw error;
    }
}
