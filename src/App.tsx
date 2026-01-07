import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, CandlestickSeries } from 'lightweight-charts';
import {
    KlineData,
    AnalysisResult,
    SYMBOLS,
    Timeframe,
} from './types';
import { getMultiTimeframeData } from './services/itickApi';
import { analyzeMarket } from './services/geminiApi';
import { formatPrice } from './utils/formatters';
import './index.css';

type TimeframeData = {
    M5: KlineData[];
    M30: KlineData[];
    H1: KlineData[];
    H4: KlineData[];
};

// Mock ticker data
const TICKER_DATA = [
    { icon: '💱', name: 'EUR/USD', price: '1.16837', change: '-0.00 (-0.04%)', isPositive: false },
    { icon: '📊', name: 'DXY Index', price: '98.595', change: '-0.237 (-0.24%)', isPositive: false },
    { icon: '🪙', name: 'Gold', price: '4,471.155', change: '-23.48 (-0.52%)', isPositive: false },
    { icon: '💹', name: 'BTC', price: '92,721', change: '-989.00', isPositive: false },
];

function App() {
    // State
    const [geminiApiKey, setGeminiApiKey] = useState(() =>
        localStorage.getItem('gemini_api_key') || ''
    );
    const [itickToken, setItickToken] = useState(() =>
        localStorage.getItem('itick_token') || ''
    );
    const [selectedSymbol, setSelectedSymbol] = useState<string>(SYMBOLS[0].code);
    const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('H4');
    const [klineData, setKlineData] = useState<TimeframeData | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [showApiKey, setShowApiKey] = useState(false);

    // Refs
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Save API keys to localStorage
    useEffect(() => {
        localStorage.setItem('gemini_api_key', geminiApiKey);
    }, [geminiApiKey]);

    useEffect(() => {
        localStorage.setItem('itick_token', itickToken);
    }, [itickToken]);

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
        if (!geminiApiKey) {
            setError('กรุณาใส่ Gemini API Key');
            return;
        }
        if (!itickToken) {
            setError('กรุณาใส่ iTick Token');
            return;
        }

        setLoading(true);
        setAnalyzing(true);
        setError(null);

        try {
            // Fetch data first
            const data = await getMultiTimeframeData(itickToken, selectedSymbol);
            setKlineData(data);

            // Then analyze
            const result = await analyzeMarket(geminiApiKey, selectedSymbol, data);
            setAnalysisResult(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
        } finally {
            setLoading(false);
            setAnalyzing(false);
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

    const tabs: { id: Timeframe | 'ENTRY' | 'STRUCTURE' | 'TREND', label: string }[] = [
        { id: 'ENTRY' as Timeframe, label: 'ENTRY' },
        { id: 'M5', label: 'M5' },
        { id: 'STRUCTURE' as Timeframe, label: 'STRUCTURE' },
        { id: 'M30', label: 'M30' },
        { id: 'TREND' as Timeframe, label: 'TREND' },
        { id: 'H4', label: 'H4' },
    ];

    return (
        <>
            {/* Ticker Bar */}
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
            </div>

            {/* Header */}
            <header className="header">
                <div className="header-left">
                    <div className="header-brand">
                        <span className="header-title">FX Trend</span>
                        <span className="header-by">AI-Powered Analysis</span>
                    </div>
                    <div className="header-links">
                        <a href="#">📷 ATIRXX</a>
                        <a href="#">🎵 CRYFX1</a>
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
                        <input
                            type={showApiKey ? 'text' : 'password'}
                            className="form-input"
                            placeholder="Enter Gemini API Key (AIza...)"
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                            onClick={() => setShowApiKey(!showApiKey)}
                        />
                        <div className="form-hint">
                            <span>💾 Saved locally in browser</span>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                Get Free Gemini API Key
                            </a>
                        </div>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Enter iTick Token..."
                            value={itickToken}
                            onChange={(e) => setItickToken(e.target.value)}
                            style={{ marginTop: '12px' }}
                        />
                        <div className="form-hint">
                            <span></span>
                            <a href="https://itick.org" target="_blank" rel="noopener noreferrer">
                                Get iTick Token
                            </a>
                        </div>
                    </div>

                    {/* Mission Protocol */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-icon">ℹ️</span>
                            <span className="card-title">:: MISSION PROTOCOL ::</span>
                        </div>
                        <ul className="mission-list">
                            <li>เตรียมกราฟ (สินทรัพย์ใดก็ได้)</li>
                            <li>อัปโหลดรูปกราฟ [M5, M30, H4]</li>
                        </ul>

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
                                <span>↻ vo (Cooldown) - 0m 20s</span>
                            </div>
                        )}
                    </div>

                    {/* Analyze Button */}
                    <button
                        className="btn-gold"
                        onClick={handleAnalyze}
                        disabled={loading || analyzing || !geminiApiKey}
                    >
                        {loading || analyzing ? (
                            <span className="loading-text">
                                <span className="spinner"></span>
                                กำลังวิเคราะห์...
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
                                {/* Analysis Header */}
                                <div className="analysis-header">
                                    <span>🤖 เหตุผลประกอบ (AI)</span>
                                    <span className={`analysis-badge ${analysisResult.trend.toLowerCase()}`}>
                                        {analysisResult.trend}
                                    </span>
                                </div>

                                {/* Analysis Content */}
                                <div className="analysis-content">
                                    <p>{analysisResult.structure}</p>
                                    <p>{analysisResult.summary}</p>
                                </div>

                                {/* Signal Section */}
                                <div className="signal-section">
                                    <div className="signal-header">
                                        <span className="signal-title">📊 ผลลัพธ์การวิเคราะห์</span>
                                        <button className="copy-btn" onClick={handleCopySignal}>
                                            📋 COPY
                                        </button>
                                    </div>

                                    {/* Confidence */}
                                    <div className="confidence-row">
                                        <span className="confidence-label">CONFIDENCE</span>
                                        <div className="confidence-bar">
                                            <div
                                                className="confidence-fill"
                                                style={{ width: `${analysisResult.signal.confidence}%` }}
                                            ></div>
                                        </div>
                                        <span className="confidence-value">{analysisResult.signal.confidence}%</span>
                                    </div>

                                    {/* Signal Card */}
                                    <div className={`signal-card ${analysisResult.signal.type.toLowerCase()}`}>
                                        <div className="signal-message">
                                            {analysisResult.signal.type === 'WAIT'
                                                ? 'ไม่แนะนำให้เข้าตรงนี้'
                                                : analysisResult.signal.reasoning}
                                        </div>
                                        <div className={`signal-type-large ${analysisResult.signal.type.toLowerCase()}`}>
                                            {analysisResult.signal.type === 'WAIT'
                                                ? `Wait ${analysisResult.trend === 'BULLISH' ? 'BUY' : 'SELL'} Limit at ${formatPrice(analysisResult.signal.entryPrice)}`
                                                : `${analysisResult.signal.type} at ${formatPrice(analysisResult.signal.entryPrice)}`}
                                        </div>
                                    </div>

                                    {/* Entry */}
                                    <div className="entry-section">
                                        <span className="entry-label">จุดเข้าปัจจุบัน</span>
                                        <span className="entry-price">{formatPrice(analysisResult.signal.entryPrice)}</span>
                                    </div>

                                    {/* SL/TP */}
                                    <div className="sltp-grid">
                                        <div className="sltp-box">
                                            <div className="sltp-label">จุดตัดขาดทุน (SL)</div>
                                            <div className="sltp-value sl">{formatPrice(analysisResult.signal.stopLoss)}</div>
                                        </div>
                                        <div className="sltp-box">
                                            <div className="sltp-label">จุดทำกำไร (TP)</div>
                                            <div className="sltp-value tp">{formatPrice(analysisResult.signal.takeProfit)}</div>
                                        </div>
                                    </div>

                                    {/* Zones */}
                                    <div className="zones-grid">
                                        <div className="zone-box">
                                            <div className="zone-label buy">โซน BUY (Demand)</div>
                                            <div className="zone-value">
                                                {analysisResult.keyLevels.support.length > 0
                                                    ? `${formatPrice(analysisResult.keyLevels.support[0])}-${formatPrice(analysisResult.keyLevels.support[1] || analysisResult.keyLevels.support[0])}`
                                                    : '-'}
                                            </div>
                                        </div>
                                        <div className="zone-box">
                                            <div className="zone-label sell">โซน SELL (Supply)</div>
                                            <div className="zone-value">
                                                {analysisResult.keyLevels.resistance.length > 0
                                                    ? `${formatPrice(analysisResult.keyLevels.resistance[0])}-${formatPrice(analysisResult.keyLevels.resistance[1] || analysisResult.keyLevels.resistance[0])}`
                                                    : '-'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="footer">
                <p>
                    Built with ❤️ using{' '}
                    <a href="https://itick.org" target="_blank" rel="noopener noreferrer">iTick API</a>
                    {' + '}
                    <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer">Gemini AI</a>
                    {' • '}© 2024 FX Trend Analyzer • Not financial advice
                </p>
            </footer>
        </>
    );
}

export default App;
