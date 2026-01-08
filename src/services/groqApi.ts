import { AnalysisResult, KlineData } from '../types';

interface TimeframeAnalysisData {
    M5: KlineData[];
    M30: KlineData[];
    H1: KlineData[];
    H4: KlineData[];
}

function formatKlineForPrompt(data: KlineData[], timeframe: string): string {
    const recent = data.slice(-20);
    const formatted = recent.map(k =>
        `${new Date(k.timestamp).toISOString().slice(0, 16)} O:${k.open.toFixed(2)} H:${k.high.toFixed(2)} L:${k.low.toFixed(2)} C:${k.close.toFixed(2)}`
    ).join('\n');
    return `[${timeframe}]\n${formatted}`;
}

function buildAnalysisPrompt(symbol: string, data: TimeframeAnalysisData, duration: 'short' | 'medium'): string {
    const m5Text = formatKlineForPrompt(data.M5, 'M5');
    const m30Text = formatKlineForPrompt(data.M30, 'M30');
    const h1Text = formatKlineForPrompt(data.H1, 'H1');
    const h4Text = formatKlineForPrompt(data.H4, 'H4');

    // Get current price from latest M5 candle
    const latestPrice = data.M5.length > 0 ? data.M5[data.M5.length - 1].close : 0;

    if (duration === 'short') {
        return `คุณเป็นนักเทรด Scalping มืออาชีพ วิเคราะห์ ${symbol} สำหรับ **การเทรดระยะสั้น** (Scalping 10-60 นาที)

ข้อมูลราคา (OHLC, 20 แท่งล่าสุด):
${h1Text}
${m30Text}
${m5Text}

📍 **ราคาปัจจุบัน: ${latestPrice.toFixed(2)}**

🎯 **สไตล์การเทรด: SCALPING (10-60 นาที)**
- เป้าหมาย: ทำกำไรเร็วภายใน 10-60 นาที
- SL แคบ: ใช้ SL ประมาณ 10-30 pips
- TP ใกล้: Risk:Reward อย่างน้อย 1:1.5
- หาจุดเข้าที่ดีที่สุดตอนนี้ทันที

งานของคุณ (ตอบละเอียด):
1. วิเคราะห์ momentum และ trend ระยะสั้น (M5, M30) อย่างละเอียด
2. ระบุ market structure: Higher High/Higher Low หรือ Lower High/Lower Low
3. หา key support/resistance ใกล้ราคาปัจจุบัน
4. ให้สัญญาณเทรดพร้อม Entry, SL, TP ที่ชัดเจน
5. **อธิบายเหตุผลประกอบอย่างละเอียด 4-6 ประโยค** (สำคัญมาก!)

ตอบเป็น JSON (ต้องมี reasoning ละเอียด 4-6 ประโยค พร้อมวิเคราะห์ momentum, trend, key levels, ความเสี่ยง):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"อธิบายโครงสร้างตลาดระยะสั้น M5/M30 - Higher High/Low, Lower High/Low, momentum direction","keyLevels":{"support":[num,num],"resistance":[num,num]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":num,"stopLoss":num,"takeProfit":num,"confidence":0-100,"reasoning":"อธิบายเหตุผลละเอียด 4-6 ประโยค: 1) วิเคราะห์ trend และ momentum ปัจจุบัน 2) ระบุ key levels ที่สำคัญ 3) อธิบายเหตุผลว่าทำไมต้องเข้าตรงนี้ 4) ความเสี่ยงและ stop loss strategy 5) target และระยะเวลาถือ"},"summary":"สรุปสถานการณ์ระยะสั้น พร้อมแนะนำจุดเข้า-ออก และเวลาที่ควรถือ"}`
    } else {
        return `คุณเป็นนักเทรด Day Trade มืออาชีพ วิเคราะห์ ${symbol} สำหรับ **การเทรดระยะกลาง** (Day Trade - เข้าและออกภายในวัน)

ข้อมูลราคา (OHLC, 20 แท่งล่าสุด):
${h4Text}
${h1Text}
${m30Text}

📍 **ราคาปัจจุบัน: ${latestPrice.toFixed(2)}**

🎯 **สไตล์การเทรด: DAY TRADE (เข้าและออกภายในวัน)**
- เป้าหมาย: ทำกำไรภายในวัน (2-8 ชั่วโมง)
- SL กว้างกว่า: ใช้ SL ประมาณ 30-80 pips
- TP ใหญ่กว่า: Risk:Reward อย่างน้อย 1:2
- รอจุดเข้าที่ดี ไม่ต้องรีบ

งานของคุณ (ตอบละเอียด):
1. วิเคราะห์ trend หลักจาก H4 และ H1
2. ระบุ market structure: Higher High/Higher Low หรือ Lower High/Lower Low
3. หา key support/resistance zones สำคัญ
4. ให้สัญญาณเทรดพร้อม Entry, SL, TP ที่เหมาะกับ Day Trade
5. **อธิบายเหตุผลประกอบอย่างละเอียด 4-6 ประโยค** (สำคัญมาก!)

ตอบเป็น JSON (ต้องมี reasoning ละเอียด 4-6 ประโยค พร้อมวิเคราะห์ trend, structure, key levels):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"อธิบายโครงสร้างตลาดจาก H4/H1 - Higher High/Low, Lower High/Low, overall market bias","keyLevels":{"support":[num,num],"resistance":[num,num]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":num,"stopLoss":num,"takeProfit":num,"confidence":0-100,"reasoning":"อธิบายเหตุผลละเอียด 4-6 ประโยค: 1) วิเคราะห์ trend หลักจาก H4/H1 2) market structure และ key levels 3) เหตุผลที่แนะนำสัญญาณนี้ 4) risk management และ stop loss 5) target profit และระยะเวลาถือ"},"summary":"สรุปสถานการณ์ Day Trade พร้อมแนะนำจุดเข้า-ออก และระยะเวลาถือ"}`
    }
}

function parseAnalysisResponse(responseText: string): AnalysisResult {
    console.log('[Groq] Raw response:', responseText);

    let jsonStr = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
    }

    jsonStr = jsonStr.trim();

    // Try to find JSON object
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    try {
        const parsed = JSON.parse(jsonStr) as AnalysisResult;
        console.log('[Groq] Parsed successfully:', parsed);
        return parsed;
    } catch (err) {
        console.error('[Groq] Failed to parse response:', err);
        return {
            currentPrice: 0,
            trend: 'SIDEWAYS',
            structure: 'ไม่สามารถวิเคราะห์ได้ กรุณาลองใหม่อีกครั้ง',
            keyLevels: { support: [], resistance: [] },
            signal: {
                type: 'WAIT',
                entryPrice: 0,
                stopLoss: 0,
                takeProfit: 0,
                confidence: 0,
                reasoning: 'เกิดข้อผิดพลาดในการวิเคราะห์',
            },
            summary: 'ไม่สามารถวิเคราะห์ได้ กรุณาลองใหม่อีกครั้ง',
        };
    }
}

export async function analyzeMarketWithGroq(
    apiKey: string,
    symbol: string,
    data: TimeframeAnalysisData,
    duration: 'short' | 'medium' = 'short'
): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, data, duration);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional forex analyst. Always respond with valid JSON only, no markdown or extra text.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.5,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[Groq] API error:', response.status, errorText);
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[Groq] API response:', result);

    const text = result.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('Groq API returned empty response');
    }

    return parseAnalysisResponse(text);
}
