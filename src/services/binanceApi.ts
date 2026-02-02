import { KlineData, KTYPE_MAP } from '../types';

const BASE_URL = 'https://fapi.binance.com';

// Map our SYMBOLS to Binance Futures symbols
const SYMBOL_MAP: Record<string, string> = {
    'XAUUSD': 'XAUUSDT', // Gold Futures (Matches Spot Price closely)
    'EURUSD': 'EURUSDT',
    'GBPUSD': 'GBPUSDT',
    'USDJPY': 'USDJPY',  // Binance Futures has USDJPY
    'AUDUSD': 'AUDUSDT',
    'USDCAD': 'USDCAD',  // Binance Futures has USDCAD
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
    limit: number = 500
): Promise<KlineData[]> {
    // Resolve mapped symbol
    const binanceSymbol = SYMBOL_MAP[symbol] || symbol.replace('/', ''); // Try direct map, else remove slash (e.g. BTC/USDT -> BTCUSDT)

    // Binance Futures API Endpoint
    // Note: 'interval' here is already converted to Binance format (e.g. '5m') by the caller using INDERVAL_MAP
    const url = `${BASE_URL}/fapi/v1/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;

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
