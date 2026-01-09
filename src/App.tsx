import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, CandlestickSeries } from 'lightweight-charts';
import {
    KlineData,
    AnalysisResult,
    SYMBOLS,
    Timeframe,
} from './types';
import { getMultiTimeframeData } from './services/itickApi';
import { analyzeMarket as analyzeGemini } from './services/geminiApi';
import { analyzeMarketWithDeepSeek as analyzeDeepSeek } from './services/deepseekApi';
import { analyzeMarketWithGroq as analyzeGroq } from './services/groqApi';
import { sanitizeAnalysisResult } from './utils/analysisFixer';
import { formatPrice } from './utils/formatters';
import './index.css';

type TimeframeData = {
    M5: KlineData[];
    M30: KlineData[];
    H1: KlineData[];
    H4: KlineData[];
};

// Mock ticker data
/*const TICKER_DATA = [
    { icon: '💱', name: 'EUR/USD', price: '1.16837', change: '-0.00 (-0.04%)', isPositive: false },
    { icon: '📊', name: 'DXY Index', price: '98.595', change: '-0.237 (-0.24%)', isPositive: false },
    { icon: '🪙', name: 'Gold', price: '4,471.155', change: '-23.48 (-0.52%)', isPositive: false },
    { icon: '💹', name: 'BTC', price: '92,721', change: '-989.00', isPositive: false },
];*/

function App() {
    // State
    const [geminiApiKey, setGeminiApiKey] = useState(() =>
        localStorage.getItem('gemini_api_key') || ''
    );
    const [deepseekApiKey, setDeepseekApiKey] = useState(() =>
        localStorage.getItem('deepseek_api_key') || ''
    );
    const [groqApiKeys, setGroqApiKeys] = useState<string[]>(() => {
        const saved = localStorage.getItem('groq_api_keys');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length === 5) return parsed;
            } catch (e) {
                console.error('Error parsing groq_api_keys', e);
            }
        }
        // Migration from old single key
        const oldKey = localStorage.getItem('groq_api_key') || '';
        return [oldKey, '', '', '', ''];
    });
    const [selectedGroqIndex, setSelectedGroqIndex] = useState(() =>
        parseInt(localStorage.getItem('selected_groq_index') || '0')
    );
    const [aiProvider, setAiProvider] = useState<'gemini' | 'deepseek' | 'groq'>(() =>
        (localStorage.getItem('ai_provider') as 'gemini' | 'deepseek' | 'groq') || 'gemini'
    );
    const [itickToken, setItickToken] = useState(() =>
        localStorage.getItem('itick_token') || ''
    );
    const [selectedSymbol, setSelectedSymbol] = useState<string>(() =>
        localStorage.getItem('selected_symbol') || SYMBOLS[0].code
    );
    const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(() =>
        (localStorage.getItem('selected_timeframe') as Timeframe) || 'H4'
    );
    const [klineData, setKlineData] = useState<TimeframeData | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => {
        const saved = localStorage.getItem('analysis_result');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing saved analysis result', e);
                return null;
            }
        }
        return null;
    });
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [showApiKey, setShowApiKey] = useState(false);
    const [tradeDuration, setTradeDuration] = useState<'short' | 'medium'>(() =>
        (localStorage.getItem('trade_duration') as 'short' | 'medium') || 'short'
    );
    const [cooldown, setCooldown] = useState(0);

    // Refs
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

    // Update time and cooldown every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());

            // Check persistent cooldown
            const endTime = localStorage.getItem('cooldown_end_time');
            if (endTime) {
                const remaining = Math.ceil((parseInt(endTime) - Date.now()) / 1000);
                if (remaining > 0) {
                    setCooldown(remaining);
                } else {
                    setCooldown(0);
                    localStorage.removeItem('cooldown_end_time');
                }
            } else {
                setCooldown(0);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Save API keys to localStorage
    useEffect(() => {
        localStorage.setItem('gemini_api_key', geminiApiKey);
    }, [geminiApiKey]);

    useEffect(() => {
        localStorage.setItem('deepseek_api_key', deepseekApiKey);
    }, [deepseekApiKey]);

    useEffect(() => {
        localStorage.setItem('groq_api_keys', JSON.stringify(groqApiKeys));
    }, [groqApiKeys]);

    useEffect(() => {
        localStorage.setItem('selected_groq_index', selectedGroqIndex.toString());
    }, [selectedGroqIndex]);

    useEffect(() => {
        localStorage.setItem('ai_provider', aiProvider);
    }, [aiProvider]);

    useEffect(() => {
        localStorage.setItem('trade_duration', tradeDuration);
    }, [tradeDuration]);

    useEffect(() => {
        localStorage.setItem('itick_token', itickToken);
    }, [itickToken]);

    useEffect(() => {
        localStorage.setItem('selected_symbol', selectedSymbol);
    }, [selectedSymbol]);

    useEffect(() => {
        localStorage.setItem('selected_timeframe', selectedTimeframe);
    }, [selectedTimeframe]);

    useEffect(() => {
        if (analysisResult) {
            localStorage.setItem('analysis_result', JSON.stringify(analysisResult));
        } else {
            localStorage.removeItem('analysis_result');
        }
    }, [analysisResult]);

    // Initialize chart
    const initChart = useCallback(() => {
        if (!chartContainerRef.current) return;

        if (chartRef.current) {
            chartRef.current.remove();
        }

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: 'transparent' },
                textColor: '#5a5a66',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 200,
            crosshair: {
                vertLine: { color: 'rgba(245, 166, 35, 0.4)' },
                horzLine: { color: 'rgba(245, 166, 35, 0.4)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'rgba(255, 255, 255, 0.05)',
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.05)',
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderUpColor: '#22c55e',
            borderDownColor: '#ef4444',
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (klineData) {
            initChart();
        }
    }, [klineData, initChart]);


    // Update chart data
    useEffect(() => {
        if (!klineData || !seriesRef.current) return;

        const data = klineData[selectedTimeframe];
        if (!data || data.length === 0) return;

        const chartData: CandlestickData<Time>[] = data.map((k) => ({
            time: (k.timestamp / 1000) as Time,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
        }));

        seriesRef.current.setData(chartData);
        chartRef.current?.timeScale().fitContent();
    }, [klineData, selectedTimeframe]);

    // Fetch data and analyze
    const handleAnalyze = async () => {
        const groqApiKey = groqApiKeys[selectedGroqIndex];
        const currentApiKey = aiProvider === 'gemini' ? geminiApiKey : aiProvider === 'deepseek' ? deepseekApiKey : groqApiKey;
        const providerName = aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'deepseek' ? 'DeepSeek' : 'Groq';

        if (!currentApiKey) {
            setError(`กรุณาใส่ ${providerName} API Key`);
            return;
        }
        if (!itickToken) {
            setError('กรุณาใส่ iTick Token');
            return;
        }

        setLoading(true);
        setAnalyzing(true);
        setError(null);
        setAnalysisResult(null); // Clear old analysis immediately

        try {
            // Fetch data first
            const data = await getMultiTimeframeData(itickToken, selectedSymbol);
            setKlineData(data);

            // Then analyze using selected provider with trade duration
            let result;
            if (aiProvider === 'gemini') {
                result = await analyzeGemini(geminiApiKey, selectedSymbol, data, tradeDuration);
            } else if (aiProvider === 'deepseek') {
                result = await analyzeDeepSeek(deepseekApiKey, selectedSymbol, data, tradeDuration);
            } else {
                result = await analyzeGroq(groqApiKeys[selectedGroqIndex], selectedSymbol, data, tradeDuration);
            }
            // Sanitize the result to fix fused numbers or other AI quirks
            const sanitizedResult = sanitizeAnalysisResult(result);
            setAnalysisResult(sanitizedResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
        } finally {
            setLoading(false);
            setAnalyzing(false);

            // Set cooldown until next minute boundary
            const now = new Date();
            const secondsUntilNextMinute = 60 - now.getSeconds();
            const endTime = Date.now() + secondsUntilNextMinute * 1000;
            localStorage.setItem('cooldown_end_time', endTime.toString());
            setCooldown(secondsUntilNextMinute);
        }
    };

    // Copy signal
    const handleCopySignal = () => {
        if (!analysisResult?.signal) return;

        const { signal } = analysisResult;
        const text = `📊 ${selectedSymbol} Signal
🎯 ${signal.type} @ ${formatPrice(signal.entryPrice)}
🛑 SL: ${formatPrice(signal.stopLoss)}
✅ TP: ${formatPrice(signal.takeProfit)}
📈 Confidence: ${signal.confidence}%
💡 ${signal.reasoning}`;

        navigator.clipboard.writeText(text);
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const tabs: { id: Timeframe, label: string }[] = [
        { id: 'M5', label: 'M5' },
        { id: 'M30', label: 'M30' },
        { id: 'H1', label: 'H1' },
        { id: 'H4', label: 'H4' },
    ];

    return (
        <>
            {/* Ticker Bar 
            <div className="ticker-bar">
                {TICKER_DATA.map((item, i) => (
                    <div key={i} className="ticker-item">
                        <span className="ticker-icon">{item.icon}</span>
                        <span className="ticker-name">{item.name}</span>
                        <span className="ticker-price">{item.price}</span>
                        <span className={`ticker-change ${item.isPositive ? 'positive' : 'negative'}`}>
                            {item.change}
                        </span>
                    </div>
                ))}
            </div>*/}

            {/* Header */}
            <header className="header">
                <div className="header-left">
                    <div className="header-brand">
                        <span className="header-title">FX Trend</span>
                        <span className="header-by">AI-Powered Analysis</span>
                    </div>
                    <div className="header-links">
                        <div className="status-online">
                            <span className="status-dot"></span>
                            ONLINE
                        </div>
                        <div className="status-time">{formatTime(currentTime)}</div>
                    </div>
                </div>
                <div className="header-right">
                    <button className="btn-support">❤️ สนับสนุน</button>
                    <div className="lang-toggle">
                        <button className="lang-btn active">TH</button>
                        <button className="lang-btn">EN</button>
                    </div>
                </div>
            </header>

            {/* Error */}
            {error && <div style={{ padding: '0 24px' }}><div className="error-message">⚠️ {error}</div></div>}

            {/* Main Layout */}
            <main className="main-container">
                {/* Left Panel */}
                <div className="left-panel">
                    {/* API Configuration */}
                    <div className="card gold-border">
                        <div className="card-header">
                            <span className="card-icon">🔑</span>
                            <span className="card-title">:: การตั้งค่า API ::</span>
                        </div>

                        {/* AI Provider Toggle */}
                        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#a0a0a8' }}>AI Provider:</span>
                                <div className="lang-toggle">
                                    <button
                                        className={`lang-btn ${aiProvider === 'gemini' ? 'active' : ''}`}
                                        onClick={() => setAiProvider('gemini')}
                                    >
                                        🔮 Gemini
                                    </button>
                                    <button
                                        className={`lang-btn ${aiProvider === 'deepseek' ? 'active' : ''}`}
                                        onClick={() => setAiProvider('deepseek')}
                                    >
                                        🐋 DeepSeek
                                    </button>
                                    <button
                                        className={`lang-btn ${aiProvider === 'groq' ? 'active' : ''}`}
                                        onClick={() => setAiProvider('groq')}
                                    >
                                        ⚡ Groq
                                    </button>
                                </div>
                            </div>

                            {/* Groq Slot Selector */}
                            {aiProvider === 'groq' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#7a7a85' }}>Slot:</span>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {[0, 1, 2, 3, 4].map((idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedGroqIndex(idx)}
                                                style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '4px',
                                                    border: '1px solid',
                                                    borderColor: selectedGroqIndex === idx ? '#f5a623' : '#3a3a45',
                                                    background: selectedGroqIndex === idx ? 'rgba(245, 166, 35, 0.1)' : '#1a1a20',
                                                    color: selectedGroqIndex === idx ? '#f5a623' : '#a0a0a8',
                                                    fontSize: '0.7rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                {idx + 1}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Gemini API Key */}
                        {aiProvider === 'gemini' && (
                            <>
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Enter Gemini API Key (AIza...)"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                    onFocus={() => setShowApiKey(true)}
                                    onBlur={() => setShowApiKey(false)}
                                    title="Click Analyze to see current key state"
                                />
                                <div className="form-hint">
                                    <span>💾 Saved locally</span>
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                        Get Gemini Key
                                    </a>
                                </div>
                            </>
                        )}

                        {/* DeepSeek API Key */}
                        {aiProvider === 'deepseek' && (
                            <>
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Enter DeepSeek API Key (sk-...)"
                                    value={deepseekApiKey}
                                    onChange={(e) => setDeepseekApiKey(e.target.value)}
                                    onFocus={() => setShowApiKey(true)}
                                    onBlur={() => setShowApiKey(false)}
                                />
                                <div className="form-hint">
                                    <span></span>
                                    <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">
                                        Get DeepSeek Key
                                    </a>
                                </div>
                            </>
                        )}

                        {/* Groq API Key */}
                        {aiProvider === 'groq' && (
                            <>
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder={`Enter Groq API Key Slot ${selectedGroqIndex + 1} (gsk_...)`}
                                    value={groqApiKeys[selectedGroqIndex]}
                                    onChange={(e) => {
                                        const newKeys = [...groqApiKeys];
                                        newKeys[selectedGroqIndex] = e.target.value;
                                        setGroqApiKeys(newKeys);
                                    }}
                                    onFocus={() => setShowApiKey(true)}
                                    onBlur={() => setShowApiKey(false)}
                                />
                                <div className="form-hint">
                                    <span>⚡ Slot {selectedGroqIndex + 1} Selected</span>
                                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                                        Get Groq Key
                                    </a>
                                </div>
                            </>
                        )}

                        {/* iTick Token */}
                        <input
                            type={showApiKey ? 'text' : 'password'}
                            className="form-input"
                            placeholder="Enter iTick Token..."
                            value={itickToken}
                            onChange={(e) => setItickToken(e.target.value)}
                            onFocus={() => setShowApiKey(true)}
                            onBlur={() => setShowApiKey(false)}
                            style={{ marginTop: '12px' }}
                        />
                        <div className="form-hint">
                            <span></span>
                            <a href="https://itick.org" target="_blank" rel="noopener noreferrer">
                                Get iTick Token
                            </a>
                        </div>
                    </div>

                    {/* Chart Selection */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-icon">📊</span>
                            <span className="card-title">:: เลือกกราฟ ::</span>
                        </div>

                        {/* Trade Duration Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#a0a0a8' }}>ระยะเวลา:</span>
                            <div className="lang-toggle">
                                <button
                                    className={`lang-btn ${tradeDuration === 'short' ? 'active' : ''}`}
                                    onClick={() => setTradeDuration('short')}
                                >
                                    ⚡ Scalping (10-60 นาที)
                                </button>
                                <button
                                    className={`lang-btn ${tradeDuration === 'medium' ? 'active' : ''}`}
                                    onClick={() => setTradeDuration('medium')}
                                >
                                    📈 Day Trade (ภายในวัน)
                                </button>
                            </div>
                        </div>

                        {/* Symbol Selection */}
                        <select
                            className="form-select"
                            value={selectedSymbol}
                            onChange={(e) => setSelectedSymbol(e.target.value)}
                            style={{ marginBottom: '12px' }}
                        >
                            {SYMBOLS.map((sym) => (
                                <option key={sym.code} value={sym.code}>
                                    {sym.code} - {sym.name}
                                </option>
                            ))}
                        </select>

                        {/* Tabs */}
                        <div className="tf-tabs">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    className={`tf-tab ${selectedTimeframe === tab.id ? 'active' : ''}`}
                                    onClick={() => {
                                        if (['M5', 'M30', 'H1', 'H4'].includes(tab.id)) {
                                            setSelectedTimeframe(tab.id as Timeframe);
                                        }
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>



                        {/* Chart */}
                        {klineData && (
                            <div className="chart-container" ref={chartContainerRef}></div>
                        )}

                        {/* Cooldown */}
                        {loading && (
                            <div className="cooldown-bar">
                                <span className="spinner"></span>
                                <span>↻</span>
                            </div>
                        )}
                    </div>

                    {/* Analyze Button */}
                    <button
                        className="btn-gold"
                        onClick={handleAnalyze}
                        disabled={loading || analyzing || cooldown > 0 || !itickToken || !(geminiApiKey || deepseekApiKey || groqApiKeys[selectedGroqIndex])}
                    >
                        {loading || analyzing ? (
                            <span className="loading-text">
                                <span className="spinner"></span>
                                กำลังวิเคราะห์...
                            </span>
                        ) : cooldown > 0 ? (
                            <span className="loading-text">
                                ↻ รอ Cooldown -- {cooldown}s
                            </span>
                        ) : (
                            <>⚡ เริ่มวิเคราะห์</>
                        )}
                    </button>
                </div>

                {/* Right Panel - Results */}
                <div className="right-panel">
                    <div className="result-panel">
                        <div className="result-header">
                            <span>📊</span>
                            <span className="result-title">ผลลัพธ์การวิเคราะห์</span>
                        </div>

                        {!analysisResult ? (
                            <div className="result-placeholder">
                                <span className="result-placeholder-icon">📈</span>
                                <span>รอข้อมูลกราฟ...</span>
                            </div>
                        ) : (
                            <div className="analysis-section">
                                {/* 1. AI Analysis Section (Top) */}
                                <div className="ai-analysis-box-premium">
                                    <div className="ai-analysis-header-premium">
                                        <span className="ai-robot-icon">🤖</span>
                                        <span className="ai-title-premium">เหตุผลประกอบ (AI)</span>
                                    </div>
                                    <div className="ai-analysis-content-premium">
                                        <p>
                                            {analysisResult.signal.reasoning
                                                .split(/(\d+[\)]) /g)
                                                .map((part, i) => {
                                                    if (part.match(/^\d+[\)]$/)) {
                                                        return (
                                                            <span key={i} className="ai-number-highlight">
                                                                {i > 0 ? '\n' : ''}{part}{' '}
                                                            </span>
                                                        );
                                                    }
                                                    return <span key={i}>{part}</span>;
                                                })}
                                            {(analysisResult.summary || analysisResult.signal.summary) && (
                                                <>
                                                    {'\n'}<span className="ai-number-highlight">สรุป:</span>{' '}
                                                    <span>{analysisResult.summary || analysisResult.signal.summary}</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {/* 1.5 Analysis Summary (New) */}
                                {analysisResult.signal.summary && (
                                    <div className="summary-box-premium">
                                        <div className="summary-label-premium">📌 สรุปแผนเทรด</div>
                                        <div className="summary-text-premium">{analysisResult.signal.summary}</div>
                                    </div>
                                )}

                                {/* 2. Result Header with COPY button */}
                                <div className="result-header-row-premium">
                                    <div className="signal-header-premium">
                                        <div className="signal-title-group">
                                            <span className="signal-bars-icon">📊</span>
                                            <span className="signal-title-premium">ผลลัพธ์การวิเคราะห์</span>
                                        </div>
                                        <button className="copy-btn-premium" onClick={handleCopySignal}>
                                            <span className="copy-icon">📄</span> COPY
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Main Action Box & Confidence Card */}
                                <div className="signal-action-row">
                                    {(() => {
                                        const currentPrice = analysisResult.currentPrice || analysisResult.signal.entryPrice;
                                        const entryPrice = analysisResult.signal.entryPrice;
                                        const priceDiffPercent = Math.abs(currentPrice - entryPrice) / currentPrice;
                                        const isAtEntry = priceDiffPercent < 0.0004;

                                        if (analysisResult.signal.type === 'WAIT' || !isAtEntry) {
                                            return (
                                                <div className="signal-action-box wait">
                                                    ไม่แนะนำให้เข้าตรงนี้
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className={`signal-action-box ${analysisResult.signal.type.toLowerCase()}`}>
                                                {analysisResult.signal.type === 'BUY'
                                                    ? '🟢 BUY - แนะนำเข้าซื้อ'
                                                    : '🔴 SELL - แนะนำเข้าขาย'}
                                            </div>
                                        );
                                    })()}
                                    <div className="confidence-card-premium">
                                        <div className="confidence-label-premium">CONFIDENCE</div>
                                        <div className="confidence-value-premium">{analysisResult.signal.confidence}%</div>
                                    </div>
                                </div>

                                {/* 4. AI Volume Check Row 
                                <div className="volume-check-row">
                                    <span className="volume-check-label">AI VOLUME CHECK</span>
                                    <span className="volume-check-status analyzing">Analyzing...</span>
                                </div>*/}

                                {/* 5. Recommendation Card (Neon Purple) */}
                                <div className="feature-card-premium neon-purple">
                                    <div className="card-label-premium purple">โซนแนะนำ / รอเข้า</div>
                                    <div className="card-content-premium">
                                        <span className="card-value-premium">
                                            {analysisResult.signal.type === 'WAIT'
                                                ? `Wait ${analysisResult.signal.entryPrice < (analysisResult.currentPrice || 0) ? 'BUY' : 'SELL'} Limit at ${formatPrice(analysisResult.signal.entryPrice)}`
                                                : `${analysisResult.signal.type} at ${formatPrice(analysisResult.signal.entryPrice)}`}
                                        </span>
                                        <span className="card-icon-premium">🗺️</span>
                                    </div>
                                </div>

                                {/* 6. Entry Card (Neon Blue) */}
                                <div className="feature-card-premium neon-blue">
                                    <div className="card-label-premium blue">ราคาปัจจุบัน</div>
                                    <div className="card-content-premium">
                                        <span className="card-value-large-premium">
                                            {formatPrice(analysisResult.currentPrice || analysisResult.signal.entryPrice)}
                                        </span>
                                        <span className="card-icon-premium highlight">🎯</span>
                                    </div>
                                </div>

                                {/* 7. SL/TP Grid (Neon Red/Green) */}
                                <div className="sltp-grid-premium">
                                    <div className="feature-card-premium neon-red">
                                        <div className="card-label-premium red">จุดตัดขาดทุน (SL)</div>
                                        <div className="card-value-medium-premium red">
                                            {formatPrice(analysisResult.signal.stopLoss)}
                                        </div>
                                    </div>
                                    <div className="feature-card-premium neon-green">
                                        <div className="card-label-premium green">จุดทำกำไร (TP)</div>
                                        <div className="card-value-medium-premium green">
                                            {formatPrice(analysisResult.signal.takeProfit)}
                                        </div>
                                    </div>
                                </div>

                                {/* 8. Demand/Supply Grid */}
                                <div className="zones-grid-premium">
                                    <div className="zone-box-dark">
                                        <div className="zone-label-dark">โซนรอ BUY (Demand)</div>
                                        <div className="zone-value-dark green">
                                            {analysisResult.keyLevels.support.length > 0
                                                ? `${formatPrice(analysisResult.keyLevels.support[0])}-${formatPrice(analysisResult.keyLevels.support[1] || analysisResult.keyLevels.support[0])}`
                                                : '-'}
                                        </div>
                                    </div>
                                    <div className="zone-box-dark">
                                        <div className="zone-label-dark">โซนรอ SELL (Supply)</div>
                                        <div className="zone-value-dark red">
                                            {analysisResult.keyLevels.resistance.length > 0
                                                ? `${formatPrice(analysisResult.keyLevels.resistance[0])}-${formatPrice(analysisResult.keyLevels.resistance[1] || analysisResult.keyLevels.resistance[0])}`
                                                : '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main >

            {/* Footer */}
            < footer className="footer" >
                <p>
                    Built with ❤️ using{' '}
                    <a href="https://itick.org" target="_blank" rel="noopener noreferrer">iTick API</a>
                    {' + '}
                    <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer">Gemini AI</a>
                    {' + '}
                    <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">Groq AI</a>
                    {' • '}© 2026 FX Trend Analyzer • Not financial advice
                </p>
            </footer >
        </>
    );
}

export default App;
