import { KlineData, KTYPE_MAP } from '../types';

const BASE_URL = 'https://api.itick.org';

// iTick API Response format based on their documentation
interface ITickApiResponse {
    code: number;
    msg: string | null;
    data: Array<{
        o: string; // open
        h: string; // high
        l: string; // low
        c: string; // close
        v: string; // volume
        t: number; // timestamp
        tu?: string; // transaction amount (optional)
    }>;
}

export async function fetchKlineData(
    token: string,
    symbol: string,
    kType: number,
    limit: number = 100,
    region: string = 'GB',
    category: string = 'forex'
): Promise<KlineData[]> {
    const url = `${BASE_URL}/${category}/kline?region=${region}&code=${symbol}&kType=${kType}&limit=${limit}`;

    console.log('[iTick API] Fetching:', url);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'token': token,
            },
        });

        const responseText = await response.text();
        console.log('[iTick API] Response status:', response.status);
        console.log('[iTick API] Response body:', responseText.substring(0, 500));

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('iTick Token ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบการตั้งค่าครับ');
            }
            if (response.status === 429) {
                throw new Error('คุณเรียกข้อมูลจาก iTick บ่อยเกินไป (จำกัด 5 ครั้ง/นาที) กรุณารอจนกว่าคูลดาวน์จะหมดครับ');
            }
            throw new Error(`iTick API เกิดข้อผิดพลาด: ${response.status} ${response.statusText}`);
        }

        let jsonData: ITickApiResponse;
        try {
            jsonData = JSON.parse(responseText);
        } catch {
            throw new Error(`iTick API: Invalid JSON response - ${responseText.substring(0, 200)}`);
        }

        // Check API response code
        if (jsonData.code !== 0) {
            throw new Error(`iTick API error: ${jsonData.msg || 'Unknown error'} (code: ${jsonData.code})`);
        }

        // Check if data exists and is an array
        if (!jsonData.data || !Array.isArray(jsonData.data)) {
            throw new Error(`iTick API: No kline data returned. Response: ${JSON.stringify(jsonData).substring(0, 200)}`);
        }

        if (jsonData.data.length === 0) {
            console.warn('[iTick API] Warning: Empty data array returned');
            return [];
        }

        return jsonData.data.map((k) => ({
            timestamp: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v) || 0,
        }));
    } catch (error) {
        console.error('[iTick API] Error:', error);
        throw error;
    }
}

// Aggregate H1 candles into H4 candles
export function aggregateToH4(h1Data: KlineData[]): KlineData[] {
    const h4Data: KlineData[] = [];

    // Sort by timestamp ascending
    const sorted = [...h1Data].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sorted.length; i += 4) {
        const chunk = sorted.slice(i, i + 4);
        if (chunk.length === 0) break;

        const h4Candle: KlineData = {
            timestamp: chunk[0].timestamp,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum, c) => sum + c.volume, 0),
        };

        h4Data.push(h4Candle);
    }

    return h4Data;
}

export async function getMultiTimeframeData(
    token: string,
    symbol: string,
    region: string = 'GB',
    category: string = 'forex'
): Promise<{ M5: KlineData[]; M15: KlineData[]; M30: KlineData[]; H1: KlineData[]; H4: KlineData[]; D1: KlineData[] }> {
    // Fetch all timeframes with delay to respect rate limit (5 calls/min)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    console.log('[iTick API] Starting multi-timeframe fetch for', symbol);

    const m5Data = await fetchKlineData(token, symbol, KTYPE_MAP.M5, 100, region, category);
    console.log('[iTick API] M5 data:', m5Data.length, 'candles');
    await delay(300);

    const m15Data = await fetchKlineData(token, symbol, KTYPE_MAP.M15, 100, region, category);
    console.log('[iTick API] M15 data:', m15Data.length, 'candles');
    await delay(300);

    const m30Data = await fetchKlineData(token, symbol, KTYPE_MAP.M30, 100, region, category);
    console.log('[iTick API] M30 data:', m30Data.length, 'candles');
    await delay(300);

    // Fetch more H1 data to aggregate into H4 (need 4x more for same number of H4 candles)
    const h1Data = await fetchKlineData(token, symbol, KTYPE_MAP.H1, 200, region, category);
    console.log('[iTick API] H1 data:', h1Data.length, 'candles');
    await delay(300);

    const d1Data = await fetchKlineData(token, symbol, KTYPE_MAP.D1, 100, region, category);
    console.log('[iTick API] D1 data:', d1Data.length, 'candles');

    // Aggregate H1 to H4
    const h4Data = aggregateToH4(h1Data);
    console.log('[iTick API] H4 data (aggregated):', h4Data.length, 'candles');

    return {
        M5: m5Data,
        M15: m15Data,
        M30: m30Data,
        H1: h1Data.slice(-100), // Keep only latest 100
        H4: h4Data,
        D1: d1Data,
    };
}
