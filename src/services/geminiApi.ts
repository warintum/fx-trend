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

function buildAnalysisPrompt(symbol: string, data: TimeframeAnalysisData, duration: 'short' | 'medium'): string {
    const m5Text = formatKlineForPrompt(data.M5, 'M5');
    const m30Text = formatKlineForPrompt(data.M30, 'M30');
    const h1Text = formatKlineForPrompt(data.H1, 'H1');
    const h4Text = formatKlineForPrompt(data.H4, 'H4');

    // Get current price from latest M5 candle
    const latestPrice = data.M5.length > 0 ? data.M5[data.M5.length - 1].close : 0;

    const commonInstructions = `
คุณเป็นนักเทรดมืออาชีพที่ใช้กลยุทธ์ Multi-Timeframe Analysis และ Supply/Demand Zones งานของคุณคือวิเคราะห์ ${symbol} อย่างละเอียดและให้สัญญาณที่แม่นยำ

**หลักการวิเคราะห์:**
1. **HTF First**: ต้องพิจารณาเทรนด์หลักจาก High Timeframe (H4, H1) เป็นอันดับแรกเสมอ
2. **LTF Context**: พยากรณ์ราคาใน M30 สำหรับจุดเข้า หาก M30 กำลังสวนเทรนด์ H4 ให้มองว่าเป็น "การย่อตัว (Pullback)"
3. **Execution Zone**: ค้นหา Supply หรือ Demand Zone สำคัญ (รวมถึงระดับราคาจิตวิทยา x.00) เพื่อหาจุดเข้าที่ได้เปรียบที่สุด
4. **Action Rule**: 
   - หากราคาอยู่ในโซนที่ได้เปรียบ -> ให้สัญญาณ BUY หรือ SELL
   - หากราคาพุ่งขึ้น/ลงแรงจนไกลจากแนวรับแนวต้าน -> ให้แนะนำ "WAIT" และบอกราคาที่จะรอเข้า (BUY/SELL Limit)
   - หากเทรนด์ไม่ชัดเจน -> ให้แนะนำ "WAIT"

📍 **ราคาปัจจุบัน: ${latestPrice.toFixed(2)}**
    `;

    if (duration === 'short') {
        return `${commonInstructions}
🎯 **สไตล์การเทรด: SCALPING (10-60 นาที)**
- วิเคราะห์ M30 และ M5 เป็นหลักเพื่อหาจุดเข้าสั้นๆ โดยต้องสอดคล้องกับ H1
- SL แคบ: 10-30 pips
- TP ใกล้: 20-50 pips

ข้อมูลราคา (20 แท่งล่าสุด):
${h1Text}
${m30Text}
${m5Text}

ตอบเป็น JSON (reasoning ต้องอธิบายความสัมพันธ์ของ HTF และ LTF):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"วิเคราะห์โครงสร้างตลาด สังเกต Higher High/Low หรือ Lower High/Low","keyLevels":{"support":[num,num],"resistance":[num,num]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":num,"stopLoss":num,"takeProfit":num,"confidence":0-100,"reasoning":"อธิบายเหตุผล 4-6 ประโยค: 1) เทรนด์หลัก H1 คืออะไร 2) M5/M30 ทำอะไรอยู่ตอนนี้ (ย่อตัวหรือวิ่งตามเทรนด์) 3) ทำไมถึงเลือกจุดเข้านี้ 4) ระบุ Demand/Supply Zone ที่อ้างอิง"},"summary":"สรุปแผน Scalping เข้า-ออกเร็ว"}`;
    } else {
        return `${commonInstructions}
🎯 **สไตล์การเทรด: DAY TRADE (2-8 ชั่วโมง)**
- เน้นเทรนด์ H4 และ H1 เป็นหลัก ค้นหาจุดเข้าจากการย่อตัวใน M30
- SL กว้างขึ้น: 30-80 pips
- TP ใหญ่: Risk:Reward 1:2 ขึ้นไป

ข้อมูลราคา (20 แท่งล่าสุด):
${h4Text}
${h1Text}
${m30Text}

ตอบเป็น JSON (reasoning ต้องอธิบายการย่อตัวเข้าสู่โซน - Pullback to Zone):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"วิเคราะห์โครงสร้างตลาด H4/H1 และสภาวะปัจจุบันใน M30","keyLevels":{"support":[num,num],"resistance":[num,num]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":num,"stopLoss":num,"takeProfit":num,"confidence":0-100,"reasoning":"อธิบายเหตุผล 4-6 ประโยค: 1) วิเคราะห์เทรนด์ H4 2) ระบุ Demand/Supply Zone สำคัญ 3) มองว่าราคาปัจจุบันเป็นการย่อตัวเข้าหาแนวรับหรือการเด้งหาแนวต้านหรือไม่ 4) ระบุเป้าหมายและการคุมความเสี่ยง"},"summary":"สรุปแผน Day Trade ประจำวัน"}`;
    }
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

export async function analyzeMarket(
    apiKey: string,
    symbol: string,
    data: TimeframeAnalysisData,
    duration: 'short' | 'medium' = 'short'
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

    const prompt = buildAnalysisPrompt(symbol, data, duration);

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        return parseAnalysisResponse(text);
    } catch (error) {
        console.error('Gemini API error:', error);
        const msg = error instanceof Error ? error.message : '';

        if (msg.includes('quota exceeded') || msg.includes('429')) {
            throw new Error('โควตาการใช้งานของ Gemini (ฟรี) เต็มแล้วครับ (15 RPM) กรุณารอสักครู่หรือเปลี่ยนไปใช้ตัวอื่นแทน');
        }
        if (msg.includes('API key not valid') || msg.includes('401')) {
            throw new Error('API Key ของ Gemini ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่าครับ');
        }

        throw new Error(`Gemini API เกิดข้อผิดพลาด: ${msg || 'Unknown error'}`);
    }
}
