export interface KlineData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface TimeframeData {
    M5: KlineData[];
    M15: KlineData[];
    M30: KlineData[];
    H1: KlineData[];
    H4: KlineData[]; // Aggregated from H1
    D1: KlineData[];
}

export type Timeframe = keyof TimeframeData;

export interface Signal {
    type: 'BUY' | 'SELL' | 'WAIT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    reasoning: string;
    summary?: string;
}

export interface AnalysisResult {
    currentPrice: number;
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    structure: string;
    keyLevels: {
        support: number[];
        resistance: number[];
    };
    signal: Signal;
    summary: string;
}

export interface ApiConfig {
    itickToken: string;
    geminiApiKey: string;
}

export const SYMBOLS = [
    // Forex
    { code: 'XAUUSD', name: 'Gold / USD', region: 'GB', category: 'forex' },
    { code: 'USDJPY', name: 'USD / JPY', region: 'GB', category: 'forex' },
    { code: 'EURUSD', name: 'EUR / USD', region: 'GB', category: 'forex' },
    { code: 'GBPUSD', name: 'GBP / USD', region: 'GB', category: 'forex' },
    { code: 'AUDUSD', name: 'AUD / USD', region: 'GB', category: 'forex' },

    // Indices (Based on iTick Docs: GB region + SPX/NDX codes)
    { code: 'SPX', name: 'S&P 500', region: 'GB', category: 'indices' },
    { code: 'NDX', name: 'Nasdaq 100', region: 'GB', category: 'indices' },

    // Crypto (Based on iTick Docs: BA region for Binance)
    { code: 'BTCUSDT', name: 'Bitcoin / USDT', region: 'BA', category: 'crypto' },
    { code: 'ETHUSDT', name: 'Ethereum / USDT', region: 'BA', category: 'crypto' },

    // Stock (Based on User request: AAPL$US, TSLA$US)
    { code: 'AAPL$US', name: 'Apple Inc.', region: 'US', category: 'stock' },
    { code: 'TSLA$US', name: 'Tesla Inc.', region: 'US', category: 'stock' },
] as const;

export type SymbolCategory = typeof SYMBOLS[number]['category'];

export type SymbolCode = typeof SYMBOLS[number]['code'];

export const KTYPE_MAP = {
    M1: 1,
    M5: 2,
    M15: 3,
    M30: 4,
    H1: 5,
    D1: 8,
    W1: 9,
    MN: 10,
} as const;
