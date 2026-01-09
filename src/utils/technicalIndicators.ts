import { KlineData } from '../types';

export interface TechnicalConsensus {
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    rsiStatus: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    ema200: number;
    rsi: number;
}

export function calculateEMA(data: number[], period: number): number {
    if (data.length < period) return 0;

    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }

    return ema;
}

export function calculateRSI(data: number[], period: number = 14): number {
    if (data.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate subsequent RSI
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) {
            avgGain = (avgGain * (period - 1) + diff) / period;
            avgLoss = (avgLoss * (period - 1) + 0) / period;
        } else {
            avgGain = (avgGain * (period - 1) + 0) / period;
            avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
        }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

export function getTechnicalConsensus(data: KlineData[]): TechnicalConsensus {
    if (data.length < 200) {
        return { trend: 'SIDEWAYS', rsiStatus: 'NEUTRAL', ema200: 0, rsi: 50 };
    }

    const closePrices = data.map(k => k.close);
    const currentPrice = closePrices[closePrices.length - 1];

    // Calculate EMA 200
    const ema200 = calculateEMA(closePrices, 200);

    // Calculate RSI 14
    const rsi = calculateRSI(closePrices, 14);

    let trend: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';
    if (currentPrice > ema200) trend = 'UP';
    else if (currentPrice < ema200) trend = 'DOWN';

    let rsiStatus: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
    if (rsi > 70) rsiStatus = 'OVERBOUGHT';
    else if (rsi < 30) rsiStatus = 'OVERSOLD';

    return {
        trend,
        rsiStatus,
        ema200,
        rsi
    };
}
