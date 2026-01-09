import { GoogleGenerativeAI } from '@google/generative-ai';
import { AnalysisResult, KlineData } from '../types';
import { getTechnicalConsensus } from '../utils/technicalIndicators';

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

function buildAnalysisPrompt(symbol: string, data: TimeframeAnalysisData, duration: 'short' | 'medium', modelVersion: string): string {
    const m5Text = formatKlineForPrompt(data.M5, 'M5');
    const m30Text = formatKlineForPrompt(data.M30, 'M30');
    const h1Text = formatKlineForPrompt(data.H1, 'H1');
    const h4Text = formatKlineForPrompt(data.H4, 'H4');

    // Get current price from latest M5 candle
    const latestPrice = data.M5.length > 0 ? data.M5[data.M5.length - 1].close : 0;

    // Calculate Technical Consensus (Hard Filter)
    const h1Consensus = getTechnicalConsensus(data.H1);
    const trendText = h1Consensus.trend === 'UP' ? 'ขาขึ้น (Price > EMA200)' : (h1Consensus.trend === 'DOWN' ? 'ขาลง (Price < EMA200)' : 'ไซด์เวย์');
    const rsiText = `${h1Consensus.rsi.toFixed(1)} (${h1Consensus.rsiStatus})`;

    const commonInstructions = `
คุณเป็นนักเทรดมืออาชีพที่ใช้กลยุทธ์ Multi-Timeframe Analysis และ Supply/Demand Zones งานของคุณคือวิเคราะห์ ${symbol} อย่างละเอียดและให้สัญญาณที่แม่นยำ

🔒 **Technical Reality (ความจริงทางเทคนิค - ต้องยึดตามนี้ห้ามสวน):**
- **H1 Trend (Filter หลัก):** ${trendText}
- **RSI (14):** ${rsiText}
- **กฎเหล็ก:** ห้ามวิเคราะห์สวนทางกับ H1 Trend เด็ดขาด หาก H1 เป็นขาขึ้น ให้เน้นหา Demand Zone เพื่อย่อซื้อ (BUY Dip) เท่านั้น ห้ามแนะนำ SELL สวนเทรนด์

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

    const liteInstructions = `
🚀 **คำสั่งพิเศษสำหรับรุ่น LITE (ห้ามฝ่าฝืน):**
- คุณต้องให้ความสำคัญกับ **H1 Trend (${trendText})** เป็นอันดับหนึ่ง
- **กฎเหล็ก:** ห้ามแนะนำ SELL หากเทรนด์หลักเป็นขาขึ้น และห้ามแนะนำ BUY หากเทรนด์หลักเป็นขาลง หากราคาสวนเทรนด์แรงเกินไป ให้เลือก "WAIT" เท่านั้น
- **ห้ามเดา:** หากราคาไม่อยู่ในโซน Demand/Supply ที่ชัดเจน ให้เลือกประเภทสัญญาณเป็น "WAIT" เสมอ
    `;

    const finalPrompt = `
${modelVersion.includes('lite') ? liteInstructions : ''}
    
🎯 **วิเคราะห์ตลาด ${symbol} สำหรับการเทรด ${duration === 'short' ? 'Scalping (1 ชม.)' : 'Day Trade (วันนี้)'}**
    
${commonInstructions}
    `;

    if (duration === 'short') {
        return `${finalPrompt}
🎯 **สไตล์การเทรด: SCALPING (10-60 นาที)**
- วิเคราะห์ M30 และ M5 เป็นหลักเพื่อหาจุดเข้าสั้นๆ โดยต้องสอดคล้องกับ H1
- SL แคบ: 10-30 pips
- TP ใกล้: 20-50 pips

ข้อมูลราคา (20 แท่งล่าสุด):
${h1Text}
${m30Text}
${m5Text}

ตอบเป็น JSON (reasoning ต้องอธิบายความสัมพันธ์ของ HTF และ LTF):
ตอบเป็น JSON (reasoning ต้องอธิบายความสัมพันธ์ของ HTF และ LTF):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"วิเคราะห์โครงสร้างตลาด สังเกต Higher High/Low หรือ Lower High/Low","keyLevels":{"support":[2410.0,2400.0],"resistance":[2420.0,2430.0]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":2405.0,"stopLoss":2395.0,"takeProfit":2425.0,"confidence":75,"reasoning":"อธิบายเหตุผล 4-6 ประโยค..."},"summary":"สรุปแผน Scalping เข้า-ออกเร็ว"}`;
    } else {
        return `${finalPrompt}
🎯 **สไตล์การเทรด: DAY TRADE (2-8 ชั่วโมง)**
- เน้นเทรนด์ H4 และ H1 เป็นหลัก ค้นหาจุดเข้าจากการย่อตัวใน M30
- SL กว้างขึ้น: 30-80 pips
- TP ใหญ่: Risk:Reward 1:2 ขึ้นไป

ข้อมูลราคา (20 แท่งล่าสุด):
${h4Text}
${h1Text}
${m30Text}

ตอบเป็น JSON (reasoning ต้องอธิบายการย่อตัวเข้าสู่โซน - Pullback to Zone):
ตอบเป็น JSON (reasoning ต้องอธิบายการย่อตัวเข้าสู่โซน - Pullback to Zone):
{"currentPrice":${latestPrice.toFixed(2)},"trend":"BULLISH|BEARISH|SIDEWAYS","structure":"วิเคราะห์โครงสร้างตลาด H4/H1 และสภาวะปัจจุบันใน M30","keyLevels":{"support":[2410.0,2400.0],"resistance":[2420.0,2430.0]},"signal":{"type":"BUY|SELL|WAIT","entryPrice":2405.0,"stopLoss":2395.0,"takeProfit":2425.0,"confidence":85,"reasoning":"อธิบายเหตุผล 4-6 ประโยค..."},"summary":"สรุปแผน Day Trade ประจำวัน"}`;
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

    // --- Robust Fixes for Gemini Typo Hallucinations ---
    // Fix 1: Gemini sometimes puts ] ] instead of ] } at the end of keyLevels
    jsonStr = jsonStr.replace(/\]\s*\]\s*$/, ' ] }');
    // Fix 2: Gemini sometimes omits commas between major objects
    jsonStr = jsonStr.replace(/\}\s*\"signal\"/g, '}, "signal"');
    jsonStr = jsonStr.replace(/\}\s*\"summary\"/g, '}, "summary"');
    // Fix 3: Handle obvious truncation - if it ends with "summary": "...", but missing last brace
    if (jsonStr.includes('"summary":') && !jsonStr.trim().endsWith('}')) {
        jsonStr += ' }';
    }

    try {
        const parsed = JSON.parse(jsonStr) as AnalysisResult;

        // --- Self-Healing: Fix Zero Values for Entry/SL/TP ---
        if (parsed.signal) {
            const s = parsed.signal;
            const sup = parsed.keyLevels?.support || [];
            const res = parsed.keyLevels?.resistance || [];

            // If Entry is 0 or null but we are waiting/trading, pick from zones
            if (!s.entryPrice) {
                if (s.type.includes('BUY') && sup.length > 0) s.entryPrice = sup[0];
                else if (s.type.includes('SELL') && res.length > 0) s.entryPrice = res[0];
                else s.entryPrice = parsed.currentPrice;
            }

            // If SL is 0 or null, calculate a safe distance
            if (!s.stopLoss && s.entryPrice > 0) {
                const distance = s.entryPrice * 0.005; // 0.5% default if unknown
                if (s.type.includes('BUY')) {
                    s.stopLoss = sup.length > 1 ? sup[1] : s.entryPrice - distance;
                } else {
                    s.stopLoss = res.length > 1 ? res[1] : s.entryPrice + distance;
                }
            }

            // If TP is 0 or null, calculate 1:1.5 RR
            if (!s.takeProfit && s.entryPrice > 0 && s.stopLoss > 0) {
                const risk = Math.abs(s.entryPrice - s.stopLoss);
                if (s.type.includes('BUY')) s.takeProfit = s.entryPrice + (risk * 1.5);
                else s.takeProfit = s.entryPrice - (risk * 1.5);
            }
        }

        console.log('[Gemini] Parsed and Fixed successfully:', parsed);
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
    duration: 'short' | 'medium' = 'short',
    modelVersion: string = 'gemini-3-flash-preview'
): Promise<AnalysisResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use the specified model version
    const model = genAI.getGenerativeModel({
        model: modelVersion,
        generationConfig: {
            temperature: 0.5,  // Lower for more consistent output
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 4096,  // Increased to prevent truncation
            responseMimeType: 'application/json',  // Force JSON output
        },
    });

    const prompt = buildAnalysisPrompt(symbol, data, duration, modelVersion);

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
