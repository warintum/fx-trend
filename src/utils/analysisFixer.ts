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

    return sanitized;
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
    // Usually UI expects [high, low] or [low, high]. 
    // Let's just sort descending for consistency if that's what UI expects?
    // Actually the UI usually does `formatPrice(price1)-formatPrice(price2)`.
    // Let's sort descending (Higher - Lower) to avoid confusion, 
    // OR just leave as is if the AI had specific intent (but identical means no intent).
    // Let's sort descending so it's always "Top - Bottom".
    result.sort((a, b) => b - a);

    return result;
}
