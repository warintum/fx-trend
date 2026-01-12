import { AnalysisResult, KlineData } from '../types';
import { getTechnicalConsensus } from '../utils/technicalIndicators';

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

    const h1Consensus = getTechnicalConsensus(data.H1);
    const rsiText = `${h1Consensus.rsi.toFixed(1)} (${h1Consensus.rsiStatus})`;

    const commonInstructions = `
คุณเป็นนักเทรดมืออาชีพที่ใช้กลยุทธ์ Multi-Timeframe Analysis และ Supply/Demand Zones งานของคุณคือวิเคราะห์ ${symbol} อย่างละเอียดและให้สัญญาณที่แม่นยำ

 🔒 **Technical Context (ข้อมูลประกอบการตัดสินใจ):**
- **RSI (14):** ${rsiText}
- **Market Condition:** วิเคราะห์จากข้อมูลราคา OHLC ที่ให้มาด้านล่าง

**หลักการวิเคราะห์:**
1. **HTF First**: ต้องพิจารณาเทรนด์หลักจาก High Timeframe (H4, H1) เป็นอันดับแรกเสมอ
2. **LTF Context**: พยากรณ์ราคาใน M30 สำหรับจุดเข้า หาก M30 กำลังสวนเทรนด์ H4 ให้มองว่าเป็น "การย่อตัว (Pullback)"
3. **Execution Zone**: ค้นหา Supply หรือ Demand Zone สำคัญ (รวมถึงระดับราคาจิตวิทยา x.00) เพื่อหาจุดเข้าที่ได้เปรียบที่สุด
4. **Action Rule**: 
   - หากราคาอยู่ในโซนที่ได้เปรียบ -> ให้สัญญาณ BUY หรือ SELL
   - หากราคาพุ่งขึ้น/ลงแรงจนไกลจากแนวรับแนวต้าน -> ให้แนะนำ "WAIT" และบอกราคาที่จะรอเข้า (BUY/SELL Limit)
   - หากเทรนด์ไม่ชัดเจน -> ให้แนะนำ "WAIT"

📍 **ราคาปัจจุบัน: ${latestPrice.toFixed(2)}**

**ข้อกำหนดทางเทคนิค (ย้ำ):**
- **ห้ามตอบ 0.0 ในราคาเด็ดขาด ให้คำนวณราคาจริงจากกราฟเสมอ**
- ให้ตอบเป็นภาษาไทยเสมอ
- \`entryPrice\`: หากราคาปัจจุบันเข้าได้เลย ให้ใส่เท่ากับราคาปัจจุบัน หากต้องรอโซน ให้ใส่ราคาโซนที่ต้องการ (ระบบจะคำนวณการรอให้อัตโนมัติ) **ห้ามใส่ 0.0**
- \`support\` และ \`resistance\` ใน JSON ต้องเป็น **Array ของตัวเลข 2 ตัว** ที่แสดงถึง **ช่วงราคาที่กว้างพอ (ขอบบนและขอบล่าง)** เสมอ เช่น [2410.50, 2400.00] **ห้ามใส่ตัวเลขเดียวกัน** และ **ห้ามเขียนตัวเลขต่อกันเด็ดขาด** (ต้องมีคอมม่าคั่น) โซนควรมีความกว้างประมาณ 1.0 - 3.0 points สำหรับทองคำ **ต้องคำนวณและใส่ราคาจริง ห้ามใส่ [0.0, 0.0] โดยเด็ดขาด**
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

ตอบเป็น JSON (reasoning ต้องอธิบายความสัมพันธ์ of HTF และ LTF):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"วิเคราะห์โครงสร้างตลาด สังเกต Higher High/Low หรือ Lower High/Low","keyLevels":{"support":[2410.0,2400.0],"resistance":[2420.0,2430.0]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":2405.0,"stopLoss":2395.0,"takeProfit":2425.0,"confidence":75,"reasoning":"อธิบายเหตุผล 4-6 ประโยค..."},"summary":"สรุปแผน Scalping เข้า-ออกเร็ว"}`;
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
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"วิเคราะห์โครงสร้างตลาด H4/H1 และสภาวะปัจจุบันใน M30","keyLevels":{"support":[2410.0,2400.0],"resistance":[2420.0,2430.0]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":2405.0,"stopLoss":2395.0,"takeProfit":2425.0,"confidence":85,"reasoning":"อธิบายเหตุผล 4-6 ประโยค..."},"summary":"สรุปแผน Day Trade ประจำวัน"}`;
    }
}

function parseAnalysisResponse(responseText: string): AnalysisResult {
    console.log('[DeepSeek] Raw response:', responseText);

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
        console.log('[DeepSeek] Parsed successfully:', parsed);
        return parsed;
    } catch (err) {
        console.error('[DeepSeek] Failed to parse response:', err);
        console.error('[DeepSeek] JSON string was:', jsonStr);
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

export async function analyzeMarketWithDeepSeek(
    apiKey: string,
    symbol: string,
    data: TimeframeAnalysisData,
    duration: 'short' | 'medium' = 'short'
): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, data, duration);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
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
        console.error('[DeepSeek] API error:', response.status, errorText);

        if (response.status === 401) {
            throw new Error('API Key ของ DeepSeek ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่าครับ');
        }
        if (response.status === 402) {
            throw new Error('ยอดเงินในบัญชี DeepSeek ของคุณไม่เพียงพอ (Insufficient Balance) กรุณาเติมเงินเข้าระบบครับ');
        }
        if (response.status === 429) {
            throw new Error('DeepSeek เรียกใช้งานบ่อยเกินไป (Rate Limit) กรุณารอสักครู่แล้วลองใหม่ครับ');
        }

        throw new Error(`DeepSeek API เกิดข้อผิดพลาด: ${response.status}`);
    }

    const result = await response.json();
    console.log('[DeepSeek] API response:', result);

    const text = result.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('DeepSeek API returned empty response');
    }

    return parseAnalysisResponse(text);
}
