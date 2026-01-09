import { AnalysisResult } from '../types';

/**
 * Sanitizes the analysis result to handle common AI failures like fused numbers.
 */
export function sanitizeAnalysisResult(result: AnalysisResult): AnalysisResult {
    const sanitized = { ...result };
    const currentPrice = result.currentPrice || 0;

    // Sanitize support and resistance arrays
    sanitized.keyLevels = {
        support: sanitizePriceArray(result.keyLevels.support, currentPrice),
        resistance: sanitizePriceArray(result.keyLevels.resistance, currentPrice),
    };

    // Smart Signal Correction (Fix Hallucinations)
    return correctSignalDirection(sanitized);
}

/**
 * Detects fused price numbers and splits them.
 * Also ensures that the zone has a minimum width (not a single line).
 */
function sanitizePriceArray(prices: number[], currentPrice: number): number[] {
    if (!Array.isArray(prices)) return [];

    let result: number[] = [];
    const currentPriceIntStr = Math.floor(currentPrice).toString();
    const expectedLen = currentPriceIntStr.length;

    prices.forEach(price => {
        // --- 1. Fusion Check ---
        // If price is suspiciously large (e.g., more than 5x current price), suspect fusion
        if (currentPrice > 0 && price > currentPrice * 5) {
            const fusedStr = Math.floor(price).toString();

            // If the string length is about double the expected length, split it
            if (fusedStr.length >= expectedLen * 2 - 1 && fusedStr.length <= expectedLen * 2 + 1) {
                const p1Str = fusedStr.substring(0, expectedLen);
                const p2Str = fusedStr.substring(expectedLen);

                const p1 = parseFloat(p1Str);
                const p2 = parseFloat(p2Str);

                // Validate if both parts are close to currentPrice
                const isP1Valid = p1 > currentPrice * 0.5 && p1 < currentPrice * 1.5;
                const isP2Valid = p2 > currentPrice * 0.5 && p2 < currentPrice * 1.5;

                if (isP1Valid && isP2Valid) {
                    result.push(p1);
                    result.push(p2);
                    return;
                }
            }
        }
        result.push(price);
    });

    // --- 2. Minimum Width Enforcement ---
    // If we have a single price, duplicate it to make a range
    if (result.length === 1) {
        result.push(result[0]);
    }

    // If we have 2 prices (standard zone), check if they are too close
    if (result.length >= 2) {
        const p1 = result[0];
        const p2 = result[1];

        // Calculate percentage difference
        const diff = Math.abs(p1 - p2);
        const avg = (p1 + p2) / 2;
        const percentDiff = (diff / avg) * 100;

        // If difference is less than 0.05%, widen it to at least 0.15% (±0.075%)
        if (percentDiff < 0.05) {
            const spread = avg * 0.00075; // 0.075%
            result[0] = avg - spread;
            result[1] = avg + spread;
        }
    }

    // Ensure p1 is higher than p2 for Demand? or strict sorting?
    // Let's sort descending so it's always "Top - Bottom".
    result.sort((a, b) => b - a);

    return result;
}

/**
 * Smart Signal Correction:
 * Determines if the signal type matches the entry location (Zone).
 * If Entry is near Support -> Should be BUY.
 * If Entry is near Resistance -> Should be SELL.
 */
function correctSignalDirection(result: AnalysisResult): AnalysisResult {
    const { signal, keyLevels, currentPrice } = result;
    const { entryPrice } = signal;
    const { support, resistance } = keyLevels;

    if (!entryPrice || !support.length || !resistance.length) return result;

    // Calculate average price of zones
    const avgSupport = support.reduce((a, b) => a + b, 0) / support.length;
    const avgResistance = resistance.reduce((a, b) => a + b, 0) / resistance.length;

    // Distances
    const distToSupport = Math.abs(entryPrice - avgSupport);
    const distToResistance = Math.abs(entryPrice - avgResistance);

    let correctedType = signal.type;

    // If significantly closer to Support than Resistance -> Bias BUY
    if (distToSupport < distToResistance * 0.5) {
        correctedType = 'BUY';
    }
    // If significantly closer to Resistance than Support -> Bias SELL
    else if (distToResistance < distToSupport * 0.5) {
        correctedType = 'SELL';
    }
    // If ambiguous, trust the original OR check against current price location
    // (e.g. if below current price significantly -> Buy Limit?)
    else {
        // Fallback: If AI says "WAIT", guess based on relative position
        if (signal.type === 'WAIT') {
            if (entryPrice < currentPrice) correctedType = 'BUY'; // Buy Dip / Buy Limit
            else correctedType = 'SELL'; // Sell Rally / Sell Limit
        }
    }

    // Force correction if different
    if (correctedType !== signal.type) {
        console.log(`[SmartFixer] Corrected Signal Type from ${signal.type} to ${correctedType}`);
        signal.type = correctedType as 'BUY' | 'SELL' | 'WAIT';
    }

    // --- 2. Fix SL/TP if they are "Distance" (e.g. 10.0) instead of "Price" ---
    // Heuristic: If SL/TP is very small relative to Entry Price (e.g. < 5%), assume it's distance/pips
    // Unless Entry Price itself is small (e.g. EURUSD 1.10), but 10.0 is huge for EURUSD.
    // Let's assume this logic applies mainly to high-value assets like Gold/BTC or if the value is explicitly uniform (10, 20).
    const isSmallSL = signal.stopLoss < entryPrice * 0.1;
    const isSmallTP = signal.takeProfit < entryPrice * 0.1;

    if (isSmallSL && signal.stopLoss > 0) {
        // Convert Distance to Price
        if (signal.type === 'BUY' || (signal.type === 'WAIT' && correctedType === 'BUY')) {
            signal.stopLoss = entryPrice - signal.stopLoss;
        } else {
            signal.stopLoss = entryPrice + signal.stopLoss;
        }
        console.log(`[SmartFixer] Converted SL Distance to Price: ${signal.stopLoss}`);
    }

    if (isSmallTP && signal.takeProfit > 0) {
        // Convert Distance to Price
        if (signal.type === 'BUY' || (signal.type === 'WAIT' && correctedType === 'BUY')) {
            signal.takeProfit = entryPrice + signal.takeProfit;
        } else {
            signal.takeProfit = entryPrice - signal.takeProfit;
        }
        console.log(`[SmartFixer] Converted TP Distance to Price: ${signal.takeProfit}`);
    }

    return {
        ...result,
        signal
    };
}
