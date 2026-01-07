import { GoogleGenerativeAI } from '@google/generative-ai';
import { KlineData, AnalysisResult, Signal } from '../types';

interface TimeframeAnalysisData {
    M5: KlineData[];
    M30: KlineData[];
    H1: KlineData[];
    H4: KlineData[];
}

function formatKlineForPrompt(data: KlineData[], timeframe: string): string {
    // Take latest 20 candles for analysis
    const latest = data.slice(-20);
    const formatted = latest.map((k, i) =>
        `${i + 1}. O:${k.open.toFixed(2)} H:${k.high.toFixed(2)} L:${k.low.toFixed(2)} C:${k.close.toFixed(2)}`
    ).join('\n');

    return `[${timeframe}]\n${formatted}`;
}

function buildAnalysisPrompt(symbol: string, data: TimeframeAnalysisData): string {
    const m5Text = formatKlineForPrompt(data.M5, 'M5');
    const m30Text = formatKlineForPrompt(data.M30, 'M30');
    const h1Text = formatKlineForPrompt(data.H1, 'H1');
    const h4Text = formatKlineForPrompt(data.H4, 'H4');

    return `คุณเป็นนักวิเคราะห์ Forex มืออาชีพ วิเคราะห์ข้อมูลราคา ${symbol} และให้สัญญาณเทรดในรูปแบบ JSON

ข้อมูลราคา (OHLC, 20 แท่งล่าสุด):
${h4Text}
${h1Text}
${m30Text}

งานของคุณ:
1. วิเคราะห์โครงสร้างตลาด (Higher High/Higher Low หรือ Lower High/Lower Low)
2. ระบุแนวโน้ม (Bullish/Bearish/Sideways)
3. หาแนวรับ-แนวต้านสำคัญ
4. ให้สัญญาณเทรดพร้อม Entry, SL, TP และความมั่นใจ

ตอบเป็น JSON เท่านั้น (ห้ามใส่ newline ใน string):
{"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"อธิบายโครงสร้างตลาด กราฟกำลังสร้างรูปแบบอะไร Higher High/Low หรือ Lower High/Low พร้อมอธิบายเหตุผลประกอบ 2-3 ประโยค","keyLevels":{"support":[num,num],"resistance":[num,num]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":num,"stopLoss":num,"takeProfit":num,"confidence":0-100,"reasoning":"เหตุผลของสัญญาณนี้ อธิบายว่าทำไมถึงแนะนำ BUY/SELL/WAIT พร้อมปัจจัยสนับสนุน"},"summary":"สรุปภาพรวมตลาด และคำแนะนำการเทรดโดยละเอียด รวมถึงความเสี่ยงและโอกาส"}`
}

function parseAnalysisResponse(responseText: string): AnalysisResult {
    console.log('[Gemini] Raw response:', responseText);

    // Try to extract JSON from the response
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

    // Try to find JSON object in the text (between first { and last })
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    try {
        const parsed = JSON.parse(jsonStr) as AnalysisResult;
        console.log('[Gemini] Parsed successfully:', parsed);
        return parsed;
    } catch (err) {
        // Return a default result if parsing fails
        console.error('[Gemini] Failed to parse response:', err);
        console.error('[Gemini] JSON string was:', jsonStr);
        return {
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

export async function analyzeMarket(
    apiKey: string,
    symbol: string,
    data: TimeframeAnalysisData
): Promise<AnalysisResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-3-flash-preview - latest Gemini 3 Flash model
    const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        generationConfig: {
            temperature: 0.5,  // Lower for more consistent output
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 4096,  // Increased to prevent truncation
            responseMimeType: 'application/json',  // Force JSON output
        },
    });

    const prompt = buildAnalysisPrompt(symbol, data);

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        return parseAnalysisResponse(text);
    } catch (error) {
        console.error('Gemini API error:', error);
        throw new Error(`Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
