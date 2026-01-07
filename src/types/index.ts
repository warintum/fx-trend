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
    M30: KlineData[];
    H1: KlineData[];
    H4: KlineData[]; // Aggregated from H1
}

export type Timeframe = keyof TimeframeData;

export interface Signal {
    type: 'BUY' | 'SELL' | 'WAIT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    reasoning: string;
}

export interface AnalysisResult {
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
    { code: 'XAUUSD', name: 'Gold / USD', region: 'GB' },
    { code: 'BTCUSD', name: 'Bitcoin / USD', region: 'GB' },
    { code: 'EURUSD', name: 'EUR / USD', region: 'GB' },
    { code: 'GBPUSD', name: 'GBP / USD', region: 'GB' },
    { code: 'USDJPY', name: 'USD / JPY', region: 'GB' },
    { code: 'AUDUSD', name: 'AUD / USD', region: 'GB' },
] as const;

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
