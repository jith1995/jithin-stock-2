import { useState, useEffect, useCallback, useRef } from "react";

export const config = { runtime: "nodejs" };

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const SECTORS = [
  { id: "it", name: "Information Technology", color: "#0088ff", stocks: ["TCS.NS","INFY.NS","WIPRO.NS","HCLTECH.NS","TECHM.NS"] },
  { id: "banking", name: "Banking & Finance", color: "#00ccaa", stocks: ["HDFCBANK.NS","ICICIBANK.NS","SBIN.NS","AXISBANK.NS","BAJFINANCE.NS"] },
  { id: "energy", name: "Energy & Oil", color: "#ffaa00", stocks: ["RELIANCE.NS","ONGC.NS","POWERGRID.NS","NTPC.NS","BPCL.NS"] },
  { id: "auto", name: "Automobiles", color: "#ff6600", stocks: ["MARUTI.NS","TATAMOTORS.NS","MM.NS","BAJAJ-AUTO.NS","HEROMOTOCO.NS"] },
  { id: "pharma", name: "Pharma & Health", color: "#aa44ff", stocks: ["SUNPHARMA.NS","DRREDDY.NS","CIPLA.NS","DIVISLAB.NS","APOLLOHOSP.NS"] },
  { id: "fmcg", name: "FMCG", color: "#ff4488", stocks: ["HINDUNILVR.NS","ITC.NS","NESTLEIND.NS","BRITANNIA.NS","DABUR.NS"] },
];

const ALL_STOCKS = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", short: "RELIANCE", sector: "Energy & Oil" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", short: "TCS", sector: "Information Technology" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", short: "HDFC BANK", sector: "Banking & Finance" },
  { symbol: "INFY.NS", name: "Infosys", short: "INFOSYS", sector: "Information Technology" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", short: "ICICI BANK", sector: "Banking & Finance" },
  { symbol: "WIPRO.NS", name: "Wipro", short: "WIPRO", sector: "Information Technology" },
  { symbol: "SBIN.NS", name: "State Bank of India", short: "SBI", sector: "Banking & Finance" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", short: "BAJAJ FIN", sector: "Banking & Finance" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki", short: "MARUTI", sector: "Automobiles" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", short: "SUN PHARMA", sector: "Pharma & Health" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies", short: "HCL TECH", sector: "Information Technology" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", short: "TATA MOTORS", sector: "Automobiles" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", short: "AXIS BANK", sector: "Banking & Finance" },
  { symbol: "ONGC.NS", name: "Oil & Natural Gas Corp", short: "ONGC", sector: "Energy & Oil" },
  { symbol: "NTPC.NS", name: "NTPC Limited", short: "NTPC", sector: "Energy & Oil" },
  { symbol: "ITC.NS", name: "ITC Limited", short: "ITC", sector: "FMCG" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", short: "HUL", sector: "FMCG" },
  { symbol: "DRREDDY.NS", name: "Dr Reddy's Laboratories", short: "DR REDDY", sector: "Pharma & Health" },
  { symbol: "TECHM.NS", name: "Tech Mahindra", short: "TECH MAHINDRA", sector: "Information Technology" },
  { symbol: "BAJAJAUT.NS", name: "Bajaj Auto", short: "BAJAJ AUTO", sector: "Automobiles" },
];

const PROXY_BASE = "/api/stock";

// ── DATA FETCHING ────────────────────────────────────────────────────────────

async function fetchStockData(symbol) {
  try {
    const res = await fetch(`${PROXY_BASE}?symbol=${symbol}&range=6mo&interval=1d`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const result = data.chart.result[0];
    const meta = result.meta;
    const closes = result.indicators.quote[0].close.map(v => v || null);
    const volumes = result.indicators.quote[0].volume.map(v => v || 0);
    const timestamps = result.timestamp;

    const validCloses = closes.filter(Boolean);
    const current = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;

    // Price returns
    const getReturn = (days) => {
      const idx = Math.max(0, validCloses.length - days - 1);
      const past = validCloses[idx];
      return past ? ((current - past) / past) * 100 : null;
    };

    // Moving averages
    const sma = (days) => {
      const slice = validCloses.slice(-days);
      if (slice.length < days) return null;
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    };

    // EMA
    const ema = (days) => {
      const k = 2 / (days + 1);
      let emaVal = validCloses[0];
      for (let i = 1; i < validCloses.length; i++) emaVal = validCloses[i] * k + emaVal * (1 - k);
      return emaVal;
    };

    // RSI
    const rsi = () => {
      const period = 14;
      const slice = validCloses.slice(-period - 1);
      if (slice.length < period + 1) return null;
      let gains = 0, losses = 0;
      for (let i = 1; i < slice.length; i++) {
        const diff = slice[i] - slice[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      const avgGain = gains / period, avgLoss = losses / period;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    };

    // 52W high/low
    const year = validCloses.slice(-252);
    const high52 = Math.max(...year);
    const low52 = Math.min(...year);
    const posIn52W = ((current - low52) / (high52 - low52)) * 100;

    // Volume analysis
    const avgVol30 = volumes.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const todayVol = volumes[volumes.length - 1] || 0;
    const volRatio = todayVol / avgVol30;

    // Golden/Death cross
    const sma20val = sma(20), sma50val = sma(50), sma200val = sma(200);
    const prevSma20 = validCloses.length > 21 ? validCloses.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 : null;
    const prevSma50 = validCloses.length > 51 ? validCloses.slice(-51, -1).reduce((a, b) => a + b, 0) / 50 : null;
    let crossSignal = "NONE";
    if (prevSma20 && prevSma50 && sma20val && sma50val) {
      if (prevSma20 < prevSma50 && sma20val > sma50val) crossSignal = "GOLDEN";
      if (prevSma20 > prevSma50 && sma20val < sma50val) crossSignal = "DEATH";
    }

    // Price history for chart
    const history = timestamps.map((t, i) => ({
      date: new Date(t * 1000).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      price: closes[i],
      volume: volumes[i],
    })).filter(d => d.price);

    // Momentum score (0-100)
    const r10 = getReturn(10) || 0, r30 = getReturn(30) || 0, r100 = getReturn(100) || 0;
    const rsiVal = rsi() || 50;
    const momentumScore = Math.min(100, Math.max(0,
      50 + (r10 * 2) + (r30 * 0.5) + (r100 * 0.2) + (rsiVal > 70 ? 10 : rsiVal < 30 ? -10 : 0)
    ));

    return {
      symbol, current, prevClose,
      change: current - prevClose,
      changePct: ((current - prevClose) / prevClose) * 100,
      returns: { d10: getReturn(10), d20: getReturn(20), d30: getReturn(30), d100: getReturn(100) },
      sma20: sma20val, sma50: sma50val, sma200: sma200val,
      ema20: ema(20),
      rsi: rsiVal,
      high52, low52, posIn52W,
      volRatio, avgVol30, todayVol,
      crossSignal, momentumScore,
      history, currency: meta.currency || "INR",
      marketCap: meta.marketCap,
    };
  } catch (e) {
    return null;
  }
}

async function getClaudeVerdict(stockInfo, stockName) {
  const prompt = `You are a quantitative analyst. Based purely on these technical indicators for ${stockName}, give a verdict. Return ONLY JSON, no markdown.

Data:
- Price: ₹${stockInfo.current?.toFixed(2)}
- Day Change: ${stockInfo.changePct?.toFixed(2)}%
- RSI(14): ${stockInfo.rsi?.toFixed(1)} ${stockInfo.rsi > 70 ? "(OVERBOUGHT)" : stockInfo.rsi < 30 ? "(OVERSOLD)" : "(NEUTRAL)"}
- 10D Return: ${stockInfo.returns?.d10?.toFixed(2)}%
- 20D Return: ${stockInfo.returns?.d20?.toFixed(2)}%
- 30D Return: ${stockInfo.returns?.d30?.toFixed(2)}%
- 100D Return: ${stockInfo.returns?.d100?.toFixed(2)}%
- SMA20: ₹${stockInfo.sma20?.toFixed(2)} | Price vs SMA20: ${stockInfo.current > stockInfo.sma20 ? "ABOVE ✅" : "BELOW ❌"}
- SMA50: ₹${stockInfo.sma50?.toFixed(2)} | Price vs SMA50: ${stockInfo.current > stockInfo.sma50 ? "ABOVE ✅" : "BELOW ❌"}
- SMA200: ₹${stockInfo.sma200?.toFixed(2)} | Price vs SMA200: ${stockInfo.current > stockInfo.sma200 ? "ABOVE ✅" : "BELOW ❌"}
- 52W Position: ${stockInfo.posIn52W?.toFixed(1)}% (0=52W low, 100=52W high)
- Volume vs 30D Avg: ${stockInfo.volRatio?.toFixed(2)}x
- MA Cross Signal: ${stockInfo.crossSignal}
- Momentum Score: ${stockInfo.momentumScore?.toFixed(0)}/100

Return JSON with:
{
  "verdict": "STRONG BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | "AVOID",
  "confidence": 0-100,
  "momentum": "STRONG BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG BEARISH",
  "rsi_signal": one sentence on what RSI tells us,
  "trend_signal": one sentence on moving average picture,
  "volume_signal": one sentence on what volume tells us,
  "key_risk": biggest technical risk in one sentence,
  "summary": 2-sentence analyst summary of the technical setup
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const text = data.content.map(c => c.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── MINI CHART ───────────────────────────────────────────────────────────────

function SparkLine({ history, change, width = 100, height = 36 }) {
  if (!history || history.length < 2) return null;
  const prices = history.map(h => h.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const color = change >= 0 ? "#00ff88" : "#ff4466";
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * width},${height - ((p - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={`g${change}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#g${change})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function BigChart({ history, sma20, sma50 }) {
  if (!history || history.length < 5) return <div style={{ color: "#1a3a5a", fontSize: "12px", padding: "20px" }}>Loading chart...</div>;
  const w = 600, h = 160;
  const prices = history.map(h => h.price);
  const allVals = [...prices, sma20, sma50].filter(Boolean);
  const min = Math.min(...allVals) * 0.998, max = Math.max(...allVals) * 1.002;
  const range = max - min || 1;
  const xScale = (i) => (i / (history.length - 1)) * w;
  const yScale = (p) => h - ((p - min) / range) * h;
  const pricePts = prices.map((p, i) => `${xScale(i)},${yScale(p)}`).join(" ");
  // Show only last 20 points for SMA lines (approximate)
  const sma20pts = prices.map((_, i) => {
    const slice = prices.slice(Math.max(0, i - 19), i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return `${xScale(i)},${yScale(avg)}`;
  }).join(" ");
  const sma50pts = prices.map((_, i) => {
    const slice = prices.slice(Math.max(0, i - 49), i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return `${xScale(i)},${yScale(avg)}`;
  }).join(" ");

  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? "#00ff88" : "#ff4466";

  // Show ~6 date labels
  const dateLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map(f => {
    const i = Math.floor(f * (history.length - 1));
    return { x: xScale(i), label: history[i]?.date };
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} y1={yScale(min + f * range)} x2={w} y2={yScale(min + f * range)}
            stroke="#0d2035" strokeWidth="1" strokeDasharray="4,4" />
        ))}
        {/* Area fill */}
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${pricePts} ${w},${h}`} fill="url(#chartGrad)" />
        {/* SMA lines */}
        <polyline points={sma20pts} fill="none" stroke="#ffaa00" strokeWidth="1" opacity="0.6" strokeDasharray="3,3" />
        <polyline points={sma50pts} fill="none" stroke="#0088ff" strokeWidth="1" opacity="0.6" strokeDasharray="3,3" />
        {/* Price line */}
        <polyline points={pricePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* Date labels */}
        {dateLabels.map((d, i) => (
          <text key={i} x={d.x} y={h + 18} textAnchor="middle" fill="#1a4a6a" fontSize="9" fontFamily="IBM Plex Mono">{d.label}</text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div style={{ width: "20px", height: "1px", background: "#ffaa00", borderTop: "1px dashed #ffaa00" }} />
          <span style={{ color: "#1a4a6a", fontSize: "10px" }}>SMA20</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div style={{ width: "20px", height: "1px", borderTop: "1px dashed #0088ff" }} />
          <span style={{ color: "#1a4a6a", fontSize: "10px" }}>SMA50</span>
        </div>
      </div>
    </div>
  );
}

// ── RSI GAUGE ────────────────────────────────────────────────────────────────

function RSIGauge({ value }) {
  if (!value) return null;
  const pct = value / 100;
  const color = value > 70 ? "#ff4466" : value < 30 ? "#00ff88" : "#ffaa00";
  const label = value > 70 ? "OVERBOUGHT" : value < 30 ? "OVERSOLD" : "NEUTRAL";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: "80px", height: "40px", margin: "0 auto" }}>
        <svg width="80" height="44" viewBox="0 0 80 44">
          <path d="M8,40 A32,32 0 0,1 72,40" fill="none" stroke="#0d2035" strokeWidth="6" strokeLinecap="round" />
          <path d="M8,40 A32,32 0 0,1 72,40" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${pct * 100.5} 100.5`} />
          <text x="40" y="38" textAnchor="middle" fill={color} fontSize="13" fontWeight="700" fontFamily="IBM Plex Mono">{value.toFixed(0)}</text>
        </svg>
      </div>
      <div style={{ color, fontSize: "9px", letterSpacing: "1px", marginTop: "2px" }}>{label}</div>
    </div>
  );
}

// ── VERDICT BADGE ────────────────────────────────────────────────────────────

function VerdictBadge({ verdict, size = "normal" }) {
  const colors = {
    "STRONG BUY": { bg: "#00ff88", text: "#000" },
    "ACCUMULATE": { bg: "#00cc66", text: "#000" },
    "HOLD": { bg: "#ffaa00", text: "#000" },
    "REDUCE": { bg: "#ff6600", text: "#000" },
    "AVOID": { bg: "#ff4466", text: "#000" },
  };
  const c = colors[verdict] || { bg: "#2a5a8a", text: "#fff" };
  return (
    <div style={{
      background: c.bg, color: c.text,
      fontSize: size === "large" ? "14px" : "10px",
      fontWeight: "800", padding: size === "large" ? "8px 18px" : "3px 8px",
      borderRadius: "3px", letterSpacing: "0.5px", display: "inline-block",
      fontFamily: "IBM Plex Mono",
    }}>{verdict || "—"}</div>
  );
}

// ── KPI BOX ──────────────────────────────────────────────────────────────────

function KPIBox({ label, value, sub, color, warn }) {
  return (
    <div style={{
      background: warn ? "rgba(255,68,102,0.06)" : "rgba(13,32,53,0.5)",
      border: `1px solid ${warn ? "#ff446633" : "#0d2035"}`,
      borderRadius: "6px", padding: "10px 14px",
    }}>
      <div style={{ color: "#1a4a6a", fontSize: "9px", letterSpacing: "1.2px", marginBottom: "5px" }}>{label}</div>
      <div style={{ color: color || "#c8d8e8", fontSize: "16px", fontWeight: "700", fontFamily: "IBM Plex Mono" }}>{value ?? "—"}</div>
      {sub && <div style={{ color: "#2a5a8a", fontSize: "10px", marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

// ── RETURN PILL ──────────────────────────────────────────────────────────────

function ReturnPill({ label, value }) {
  if (value === null || value === undefined) return (
    <div style={{ textAlign: "center", padding: "8px 12px", background: "rgba(13,32,53,0.5)", borderRadius: "5px", border: "1px solid #0d2035" }}>
      <div style={{ color: "#1a4a6a", fontSize: "9px", marginBottom: "4px" }}>{label}</div>
      <div style={{ color: "#2a5a8a", fontSize: "13px" }}>—</div>
    </div>
  );
  const isPos = value >= 0;
  return (
    <div style={{
      textAlign: "center", padding: "8px 12px",
      background: isPos ? "rgba(0,255,136,0.06)" : "rgba(255,68,102,0.06)",
      borderRadius: "5px",
      border: `1px solid ${isPos ? "#00ff8833" : "#ff446633"}`,
    }}>
      <div style={{ color: "#1a4a6a", fontSize: "9px", marginBottom: "4px" }}>{label}</div>
      <div style={{ color: isPos ? "#00ff88" : "#ff4466", fontSize: "13px", fontWeight: "700" }}>
        {isPos ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
      </div>
    </div>
  );
}

// ── POSITION BAR (52W) ───────────────────────────────────────────────────────

function PositionBar({ value, low, high }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const color = pct > 75 ? "#ff4466" : pct > 40 ? "#ffaa00" : "#00ff88";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ color: "#2a5a8a", fontSize: "9px" }}>52W LOW ₹{low?.toFixed(0)}</span>
        <span style={{ color: "#2a5a8a", fontSize: "9px" }}>52W HIGH ₹{high?.toFixed(0)}</span>
      </div>
      <div style={{ height: "6px", background: "#0d2035", borderRadius: "3px", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.8s ease" }} />
        <div style={{ position: "absolute", top: "-3px", left: `${pct}%`, transform: "translateX(-50%)", width: "12px", height: "12px", borderRadius: "50%", background: color, border: "2px solid #080c10" }} />
      </div>
      <div style={{ textAlign: "center", marginTop: "6px", color, fontSize: "11px", fontWeight: "600" }}>
        {pct.toFixed(1)}% of 52W range
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────

export default function BSEIntelligence() {
  const [page, setPage] = useState(1);
  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedStock, setSelectedStock] = useState(ALL_STOCKS[0]);
  const [verdict, setVerdict] = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("changePct");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [compareList, setCompareList] = useState([ALL_STOCKS[0], ALL_STOCKS[1]]);
  const loadedRef = useRef(false);

  // Load all stock data on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    async function loadAll() {
      setLoading(true);
      const results = {};
      await Promise.all(ALL_STOCKS.map(async (s) => {
        const d = await fetchStockData(s.symbol);
        if (d) results[s.symbol] = d;
        setStockData(prev => ({ ...prev, ...(d ? { [s.symbol]: d } : {}) }));
      }));
      setLoading(false);
    }
    loadAll();
  }, []);

  // Load Claude verdict when stock changes on page 3
  useEffect(() => {
    if (page !== 3) return;
    const d = stockData[selectedStock.symbol];
    if (!d) return;
    setVerdict(null);
    setVerdictLoading(true);
    getClaudeVerdict(d, selectedStock.name)
      .then(v => { setVerdict(v); setVerdictLoading(false); })
      .catch(() => setVerdictLoading(false));
  }, [selectedStock, page, stockData]);

  const filteredStocks = ALL_STOCKS.filter(s => {
    const d = stockData[s.symbol];
    if (sectorFilter !== "all" && s.sector !== sectorFilter) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.short.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const da = stockData[a.symbol], db = stockData[b.symbol];
    if (!da || !db) return 0;
    if (sortBy === "changePct") return db.changePct - da.changePct;
    if (sortBy === "momentum") return db.momentumScore - da.momentumScore;
    if (sortBy === "rsi") return db.rsi - da.rsi;
    if (sortBy === "vol") return db.volRatio - da.volRatio;
    if (sortBy === "r100") return (db.returns?.d100 || 0) - (da.returns?.d100 || 0);
    return 0;
  });

  // Sector aggregate data
  const sectorStats = SECTORS.map(sector => {
    const stocks = sector.stocks.map(sym => stockData[sym]).filter(Boolean);
    if (stocks.length === 0) return { ...sector, avgChange: null, count: 0 };
    const avgChange = stocks.reduce((a, b) => a + b.changePct, 0) / stocks.length;
    const bullish = stocks.filter(s => s.changePct > 0).length;
    return { ...sector, avgChange, bullish, total: stocks.length, stocks: stocks };
  });

  const d = stockData[selectedStock.symbol];

  // ── STYLES ──
  const S = {
    page: { minHeight: "100vh", background: "#080c10", color: "#c8d8e8", fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px" },
    topbar: { borderBottom: "1px solid #0d2035", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#04080c", position: "sticky", top: 0, zIndex: 100 },
    navBtn: (active) => ({
      background: active ? "#0066ff" : "transparent",
      color: active ? "#fff" : "#2a5a8a",
      border: `1px solid ${active ? "#0066ff" : "#0d2035"}`,
      borderRadius: "4px", padding: "5px 14px", fontSize: "11px",
      fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.5px",
      transition: "all 0.15s",
    }),
    card: { background: "rgba(6,10,14,0.8)", border: "1px solid #0d2035", borderRadius: "8px", padding: "16px" },
    label: { color: "#1a4a6a", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "6px" },
  };

  const loadingCount = Object.keys(stockData).length;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #04080c; }
        ::-webkit-scrollbar-thumb { background: #0d2a4a; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shimmer { 0%{background-position:-200px 0} 100%{background-position:200px 0} }
        .nav-btn:hover { border-color: #0066ff !important; color: #5599ff !important; }
        .stock-row:hover { background: rgba(0,100,255,0.05) !important; }
        .sector-card:hover { border-color: rgba(255,255,255,0.1) !important; transform: translateY(-2px); }
        .compare-btn:hover { background: rgba(0,100,255,0.1) !important; }
        input:focus { outline: none; border-color: #0066ff !important; }
      `}</style>

      {/* TOP BAR */}
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "16px", color: "#fff", letterSpacing: "-0.5px" }}>
            BSE<span style={{ color: "#0066ff" }}>·</span>IQ
          </div>
          <div style={{ color: "#0d2a40", fontSize: "11px" }}>QUANTITATIVE SCREENER</div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { n: 1, label: "MARKET" },
            { n: 2, label: "SCREENER" },
            { n: 3, label: "DEEP DIVE" },
            { n: 4, label: "COMPARE" },
          ].map(({ n, label }) => (
            <button key={n} className="nav-btn" style={S.navBtn(page === n)} onClick={() => setPage(n)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {loading && (
            <div style={{ color: "#ffaa00", fontSize: "10px", animation: "pulse 1.5s infinite" }}>
              LOADING {loadingCount}/{ALL_STOCKS.length}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00ff88", animation: "pulse 2s infinite" }} />
            <span style={{ color: "#1a4a6a", fontSize: "10px" }}>15 MIN DELAY</span>
          </div>
        </div>
      </div>

      {/* ── PAGE 1: MARKET OVERVIEW ── */}
      {page === 1 && (
        <div style={{ padding: "20px 24px", animation: "slideUp 0.3s ease" }}>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "22px", color: "#fff" }}>Market Overview</div>
            <div style={{ color: "#1a4a6a", fontSize: "11px", marginTop: "3px" }}>BSE Sector Performance · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          </div>

          {/* Market Stats Bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
            {[
              { label: "STOCKS TRACKED", value: ALL_STOCKS.length, sub: "across 6 sectors" },
              { label: "ADVANCING", value: Object.values(stockData).filter(d => d.changePct > 0).length, color: "#00ff88" },
              { label: "DECLINING", value: Object.values(stockData).filter(d => d.changePct < 0).length, color: "#ff4466" },
              { label: "OVERBOUGHT RSI>70", value: Object.values(stockData).filter(d => d.rsi > 70).length, color: "#ffaa00" },
            ].map((item, i) => (
              <div key={i} style={{ ...S.card, textAlign: "center" }}>
                <div style={S.label}>{item.label}</div>
                <div style={{ color: item.color || "#fff", fontSize: "28px", fontWeight: "700", fontFamily: "'Syne', sans-serif" }}>
                  {loading && !item.value ? "—" : item.value}
                </div>
                {item.sub && <div style={{ color: "#1a4a6a", fontSize: "10px", marginTop: "3px" }}>{item.sub}</div>}
              </div>
            ))}
          </div>

          {/* Sector Heatmap */}
          <div style={S.label}>SECTOR HEATMAP</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
            {sectorStats.map((sector) => {
              const isPos = sector.avgChange >= 0;
              const intensity = Math.min(1, Math.abs(sector.avgChange || 0) / 3);
              const bgColor = sector.avgChange === null ? "#0d2035"
                : isPos ? `rgba(0,255,136,${0.05 + intensity * 0.15})`
                : `rgba(255,68,102,${0.05 + intensity * 0.15})`;
              const borderColor = sector.avgChange === null ? "#0d2035"
                : isPos ? `rgba(0,255,136,${0.2 + intensity * 0.4})`
                : `rgba(255,68,102,${0.2 + intensity * 0.4})`;
              return (
                <div key={sector.id} className="sector-card" style={{
                  background: bgColor, border: `1px solid ${borderColor}`,
                  borderRadius: "8px", padding: "16px", cursor: "pointer",
                  transition: "all 0.2s", borderLeft: `3px solid ${sector.color}`,
                }} onClick={() => { setSectorFilter(sector.name); setPage(2); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>{sector.name}</div>
                      <div style={{ color: "#2a5a8a", fontSize: "10px" }}>{sector.total} stocks tracked</div>
                    </div>
                    {sector.avgChange !== null && (
                      <div style={{ color: isPos ? "#00ff88" : "#ff4466", fontSize: "18px", fontWeight: "700", fontFamily: "'Syne', sans-serif" }}>
                        {isPos ? "+" : ""}{sector.avgChange.toFixed(2)}%
                      </div>
                    )}
                    {sector.avgChange === null && <div style={{ color: "#1a3a5a", fontSize: "11px", animation: "pulse 1.5s infinite" }}>LOADING</div>}
                  </div>
                  {sector.total > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "#00ff88", fontSize: "10px" }}>▲ {sector.bullish || 0}</span>
                        <span style={{ color: "#ff4466", fontSize: "10px" }}>{(sector.total || 0) - (sector.bullish || 0)} ▼</span>
                      </div>
                      <div style={{ height: "3px", background: "#0d2035", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${((sector.bullish || 0) / (sector.total || 1)) * 100}%`, background: "#00ff88", transition: "width 0.8s" }} />
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: "10px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {sector.stocks.filter(Boolean).map((s, i) => (
                      <div key={i} style={{
                        fontSize: "9px", padding: "2px 6px", borderRadius: "3px",
                        background: s.changePct > 0 ? "rgba(0,255,136,0.1)" : "rgba(255,68,102,0.1)",
                        color: s.changePct > 0 ? "#00cc66" : "#ff4466",
                      }}>
                        {ALL_STOCKS.find(a => a.symbol === s.symbol)?.short || s.symbol.replace(".NS", "")}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top Movers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {[
              { title: "TOP GAINERS TODAY", stocks: [...ALL_STOCKS].sort((a, b) => (stockData[b.symbol]?.changePct || 0) - (stockData[a.symbol]?.changePct || 0)).slice(0, 5), positive: true },
              { title: "TOP LOSERS TODAY", stocks: [...ALL_STOCKS].sort((a, b) => (stockData[a.symbol]?.changePct || 0) - (stockData[b.symbol]?.changePct || 0)).slice(0, 5), positive: false },
            ].map((group) => (
              <div key={group.title} style={S.card}>
                <div style={{ ...S.label, marginBottom: "12px" }}>{group.title}</div>
                {group.stocks.map((stock) => {
                  const d = stockData[stock.symbol];
                  return (
                    <div key={stock.symbol} className="stock-row" style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "7px 8px", borderRadius: "4px", cursor: "pointer",
                      marginBottom: "2px", transition: "background 0.15s",
                    }} onClick={() => { setSelectedStock(stock); setPage(3); }}>
                      <div>
                        <div style={{ color: "#c8d8e8", fontSize: "12px", fontWeight: "500" }}>{stock.short}</div>
                        <div style={{ color: "#1a4a6a", fontSize: "10px" }}>{stock.sector}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {d ? (
                          <>
                            <div style={{ color: "#8aaccc", fontSize: "12px" }}>₹{d.current.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</div>
                            <div style={{ color: group.positive ? "#00ff88" : "#ff4466", fontSize: "11px", fontWeight: "600" }}>
                              {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                            </div>
                          </>
                        ) : <div style={{ color: "#1a3a5a", fontSize: "10px", animation: "pulse 1.5s infinite" }}>—</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PAGE 2: SCREENER ── */}
      {page === 2 && (
        <div style={{ padding: "20px 24px", animation: "slideUp 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "22px", color: "#fff" }}>Stock Screener</div>
              <div style={{ color: "#1a4a6a", fontSize: "11px", marginTop: "3px" }}>{filteredStocks.length} stocks · Click any row to deep dive</div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                placeholder="Search stocks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: "#04080c", border: "1px solid #0d2035", borderRadius: "4px",
                  padding: "6px 12px", color: "#c8d8e8", fontSize: "12px",
                  fontFamily: "inherit", width: "160px", transition: "border-color 0.15s",
                }}
              />
              <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} style={{
                background: "#04080c", border: "1px solid #0d2035", borderRadius: "4px",
                padding: "6px 10px", color: "#8aaccc", fontSize: "11px", fontFamily: "inherit",
              }}>
                <option value="all">All Sectors</option>
                {SECTORS.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                background: "#04080c", border: "1px solid #0d2035", borderRadius: "4px",
                padding: "6px 10px", color: "#8aaccc", fontSize: "11px", fontFamily: "inherit",
              }}>
                <option value="changePct">Sort: Day %</option>
                <option value="momentum">Sort: Momentum</option>
                <option value="rsi">Sort: RSI</option>
                <option value="vol">Sort: Volume</option>
                <option value="r100">Sort: 100D Return</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div style={{ border: "1px solid #0d2035", borderRadius: "8px", overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "160px 90px 80px 70px 70px 70px 70px 70px 60px 80px 80px",
              padding: "8px 12px", background: "#04080c",
              borderBottom: "1px solid #0d2035",
            }}>
              {["STOCK", "PRICE", "DAY %", "D10", "D30", "D100", "RSI", "VOL×", "MOM", "52W POS", "CHART"].map(h => (
                <div key={h} style={{ color: "#1a4a6a", fontSize: "9px", letterSpacing: "1px" }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {filteredStocks.map((stock, idx) => {
              const d = stockData[stock.symbol];
              const isLoading = !d;
              return (
                <div key={stock.symbol} className="stock-row" style={{
                  display: "grid",
                  gridTemplateColumns: "160px 90px 80px 70px 70px 70px 70px 70px 60px 80px 80px",
                  padding: "9px 12px",
                  borderBottom: idx < filteredStocks.length - 1 ? "1px solid #06101a" : "none",
                  cursor: "pointer", transition: "background 0.12s",
                  animation: `fadeIn ${0.1 + idx * 0.03}s ease`,
                }} onClick={() => { setSelectedStock(stock); setPage(3); }}>
                  <div>
                    <div style={{ color: "#c8d8e8", fontWeight: "600", fontSize: "12px" }}>{stock.short}</div>
                    <div style={{ color: "#1a3a5a", fontSize: "9px" }}>{stock.sector}</div>
                  </div>
                  <div style={{ color: "#8aaccc", fontSize: "12px" }}>{d ? `₹${d.current.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}</div>
                  <div style={{ color: d ? (d.changePct >= 0 ? "#00ff88" : "#ff4466") : "#1a3a5a", fontWeight: "600", fontSize: "12px" }}>
                    {d ? `${d.changePct >= 0 ? "+" : ""}${d.changePct.toFixed(2)}%` : "—"}
                  </div>

                  {[d?.returns?.d10, d?.returns?.d30, d?.returns?.d100].map((v, i) => (
                    <div key={i} style={{ color: v === undefined || v === null ? "#1a3a5a" : v >= 0 ? "#00cc66" : "#ff4466", fontSize: "11px" }}>
                      {v !== null && v !== undefined ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—"}
                    </div>
                  ))}
                  <div style={{ color: d ? (d.rsi > 70 ? "#ff4466" : d.rsi < 30 ? "#00ff88" : "#ffaa00") : "#1a3a5a", fontSize: "11px" }}>
                    {d ? d.rsi.toFixed(0) : "—"}
                  </div>
                  <div style={{ color: d ? (d.volRatio > 1.5 ? "#ffaa00" : "#2a5a8a") : "#1a3a5a", fontSize: "11px" }}>
                    {d ? `${d.volRatio.toFixed(1)}×` : "—"}
                  </div>
                  <div>
                    {d ? (
                      <div style={{
                        width: `${Math.min(100, d.momentumScore)}%`, height: "4px",
                        background: d.momentumScore > 60 ? "#00ff88" : d.momentumScore > 40 ? "#ffaa00" : "#ff4466",
                        borderRadius: "2px", minWidth: "4px",
                      }} />
                    ) : "—"}
                  </div>
                  <div style={{ color: d ? (d.posIn52W > 75 ? "#ff4466" : d.posIn52W < 30 ? "#00ff88" : "#ffaa00") : "#1a3a5a", fontSize: "10px" }}>
                    {d ? `${d.posIn52W.toFixed(0)}%` : "—"}
                  </div>
                  <div>{d ? <SparkLine history={d.history} change={d.change} width={70} height={28} /> : null}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PAGE 3: DEEP DIVE ── */}
      {page === 3 && (
        <div style={{ padding: "20px 24px", animation: "slideUp 0.3s ease" }}>
          {/* Stock selector */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
            {ALL_STOCKS.map(s => (
              <button key={s.symbol} onClick={() => setSelectedStock(s)} style={{
                background: selectedStock.symbol === s.symbol ? "#0066ff" : "transparent",
                color: selectedStock.symbol === s.symbol ? "#fff" : "#2a5a8a",
                border: `1px solid ${selectedStock.symbol === s.symbol ? "#0066ff" : "#0d2035"}`,
                borderRadius: "3px", padding: "4px 10px", fontSize: "10px",
                fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.3px",
              }}>{s.short}</button>
            ))}
          </div>

          {!d && <div style={{ color: "#1a4a6a", animation: "pulse 1.5s infinite", padding: "40px", textAlign: "center" }}>LOADING DATA...</div>}

          {d && (
            <>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "26px", color: "#fff" }}>{selectedStock.name}</div>
                  <div style={{ color: "#1a4a6a", fontSize: "11px", marginTop: "2px" }}>{selectedStock.sector} · {selectedStock.symbol}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginTop: "8px" }}>
                    <span style={{ color: "#fff", fontSize: "32px", fontWeight: "700", fontFamily: "'Syne', sans-serif" }}>
                      ₹{d.current.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ color: d.change >= 0 ? "#00ff88" : "#ff4466", fontSize: "16px" }}>
                      {d.change >= 0 ? "▲" : "▼"} ₹{Math.abs(d.change).toFixed(2)} ({Math.abs(d.changePct).toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ marginBottom: "8px" }}>
                    {verdictLoading ? (
                      <div style={{ color: "#ffaa00", fontSize: "12px", animation: "pulse 1s infinite" }}>CLAUDE ANALYZING...</div>
                    ) : verdict ? (
                      <VerdictBadge verdict={verdict.verdict} size="large" />
                    ) : null}
                  </div>
                  {verdict && (
                    <div style={{ color: "#2a5a8a", fontSize: "11px" }}>Confidence: {verdict.confidence}%</div>
                  )}
                </div>
              </div>

              {/* Chart */}
              <div style={{ ...S.card, marginBottom: "16px" }}>
                <div style={S.label}>6-MONTH PRICE CHART WITH SMA20 & SMA50</div>
                <BigChart history={d.history} sma20={d.sma20} sma50={d.sma50} />
              </div>

              {/* Returns */}
              <div style={{ ...S.card, marginBottom: "16px" }}>
                <div style={S.label}>PRICE RETURNS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                  <ReturnPill label="10 DAY" value={d.returns.d10} />
                  <ReturnPill label="20 DAY" value={d.returns.d20} />
                  <ReturnPill label="30 DAY" value={d.returns.d30} />
                  <ReturnPill label="100 DAY" value={d.returns.d100} />
                </div>
              </div>

              {/* KPIs Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "16px" }}>
                {/* Moving Averages */}
                <div style={S.card}>
                  <div style={S.label}>MOVING AVERAGES</div>
                  {[
                    { label: "SMA 20", val: d.sma20, above: d.current > d.sma20 },
                    { label: "SMA 50", val: d.sma50, above: d.current > d.sma50 },
                    { label: "SMA 200", val: d.sma200, above: d.current > d.sma200 },
                    { label: "EMA 20", val: d.ema20, above: d.current > d.ema20 },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
                      <span style={{ color: "#2a5a8a", fontSize: "11px" }}>{item.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "#8aaccc", fontSize: "11px" }}>₹{item.val?.toFixed(0) || "—"}</span>
                        <span style={{ color: item.above ? "#00ff88" : "#ff4466", fontSize: "10px" }}>
                          {item.above ? "▲ ABOVE" : "▼ BELOW"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {d.crossSignal !== "NONE" && (
                    <div style={{
                      marginTop: "10px", padding: "6px 10px", borderRadius: "4px",
                      background: d.crossSignal === "GOLDEN" ? "rgba(0,255,136,0.1)" : "rgba(255,68,102,0.1)",
                      color: d.crossSignal === "GOLDEN" ? "#00ff88" : "#ff4466",
                      fontSize: "11px", fontWeight: "600",
                    }}>
                      {d.crossSignal === "GOLDEN" ? "⭐ GOLDEN CROSS" : "☠️ DEATH CROSS"}
                    </div>
                  )}
                </div>

                {/* RSI */}
                <div style={{ ...S.card, textAlign: "center" }}>
                  <div style={S.label}>RSI (14)</div>
                  <RSIGauge value={d.rsi} />
                  <div style={{ marginTop: "12px", color: "#2a5a8a", fontSize: "10px", lineHeight: "1.6", textAlign: "left" }}>
                    <div>RSI: <span style={{ color: d.rsi > 70 ? "#ff4466" : d.rsi < 30 ? "#00ff88" : "#ffaa00" }}>{d.rsi.toFixed(1)}</span></div>
                    <div>Signal: {d.rsi > 70 ? "Overbought — caution" : d.rsi < 30 ? "Oversold — watch for reversal" : "Neutral zone"}</div>
                    {verdict?.rsi_signal && <div style={{ marginTop: "6px", color: "#1a4a6a", fontSize: "10px" }}>{verdict.rsi_signal}</div>}
                  </div>
                </div>

                {/* Volume */}
                <div style={S.card}>
                  <div style={S.label}>VOLUME ANALYSIS</div>
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ color: d.volRatio > 1.5 ? "#ffaa00" : "#2a5a8a", fontSize: "26px", fontWeight: "700", fontFamily: "'Syne', sans-serif" }}>
                      {d.volRatio.toFixed(2)}×
                    </div>
                    <div style={{ color: "#1a4a6a", fontSize: "10px" }}>vs 30-day average</div>
                  </div>
                  <div style={{ color: "#2a5a8a", fontSize: "10px", lineHeight: "1.8" }}>
                    <div>Today: {(d.todayVol / 1e6).toFixed(2)}M shares</div>
                    <div>30D Avg: {(d.avgVol30 / 1e6).toFixed(2)}M shares</div>
                    <div style={{ color: d.volRatio > 2 ? "#ffaa00" : "#1a4a6a" }}>
                      {d.volRatio > 2 ? "⚠️ Unusual volume spike" : d.volRatio > 1.3 ? "Above average activity" : "Normal activity"}
                    </div>
                  </div>
                </div>
              </div>

              {/* 52W Position */}
              <div style={{ ...S.card, marginBottom: "16px" }}>
                <div style={S.label}>52-WEEK RANGE POSITION</div>
                <PositionBar value={d.posIn52W} low={d.low52} high={d.high52} />
              </div>

              {/* Claude Verdict */}
              {verdict && (
                <div style={{ ...S.card, border: "1px solid #0033aa", background: "rgba(0,50,170,0.05)", animation: "fadeIn 0.5s ease" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div style={S.label}>CLAUDE AI QUANTITATIVE VERDICT</div>
                    <VerdictBadge verdict={verdict.verdict} />
                  </div>
                  <div style={{ color: "#8aaccc", fontSize: "12px", lineHeight: "1.7", marginBottom: "14px" }}>
                    {verdict.summary}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {[
                      { label: "TREND", text: verdict.trend_signal },
                      { label: "VOLUME", text: verdict.volume_signal },
                      { label: "KEY RISK", text: verdict.key_risk, warn: true },
                      { label: "MOMENTUM", text: verdict.momentum },
                    ].map(item => (
                      <div key={item.label} style={{
                        padding: "8px 12px", borderRadius: "4px",
                        background: item.warn ? "rgba(255,68,102,0.05)" : "rgba(0,0,0,0.3)",
                        border: `1px solid ${item.warn ? "#ff446622" : "#0d2035"}`,
                      }}>
                        <div style={{ color: "#1a4a6a", fontSize: "9px", letterSpacing: "1px", marginBottom: "4px" }}>{item.label}</div>
                        <div style={{ color: item.warn ? "#ff8899" : "#7aacdf", fontSize: "11px" }}>{item.text}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "12px", color: "#0d2035", fontSize: "10px" }}>
                    Based purely on technical indicators · Not financial advice · Do your own research
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PAGE 4: COMPARE ── */}
      {page === 4 && (
        <div style={{ padding: "20px 24px", animation: "slideUp 0.3s ease" }}>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "22px", color: "#fff" }}>Compare Stocks</div>
            <div style={{ color: "#1a4a6a", fontSize: "11px", marginTop: "3px" }}>Side-by-side technical comparison</div>
          </div>

          {/* Stock picker */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
            {[0, 1].map(idx => (
              <div key={idx}>
                <div style={{ color: "#1a4a6a", fontSize: "9px", letterSpacing: "1px", marginBottom: "5px" }}>STOCK {idx + 1}</div>
                <select
                  value={compareList[idx].symbol}
                  onChange={e => {
                    const s = ALL_STOCKS.find(a => a.symbol === e.target.value);
                    setCompareList(prev => { const n = [...prev]; n[idx] = s; return n; });
                  }}
                  style={{
                    background: "#04080c", border: "1px solid #0d2035", borderRadius: "4px",
                    padding: "7px 12px", color: "#c8d8e8", fontSize: "12px", fontFamily: "inherit",
                  }}
                >
                  {ALL_STOCKS.map(s => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <div style={{ border: "1px solid #0d2035", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", background: "#04080c", borderBottom: "1px solid #0d2035" }}>
              <div style={{ padding: "10px 14px", color: "#1a4a6a", fontSize: "10px" }}>METRIC</div>
              {compareList.map(s => (
                <div key={s.symbol} style={{ padding: "10px 14px", color: "#fff", fontSize: "12px", fontWeight: "600" }}>{s.short}</div>
              ))}
            </div>

            {[
              { label: "Current Price", fn: d => d ? `₹${d.current.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—" },
              { label: "Day Change", fn: d => d ? `${d.changePct >= 0 ? "+" : ""}${d.changePct.toFixed(2)}%` : "—", colorFn: d => d?.changePct >= 0 ? "#00ff88" : "#ff4466" },
              { label: "10D Return", fn: d => d?.returns?.d10 != null ? `${d.returns.d10 >= 0 ? "+" : ""}${d.returns.d10.toFixed(2)}%` : "—", colorFn: d => (d?.returns?.d10 || 0) >= 0 ? "#00ff88" : "#ff4466" },
              { label: "30D Return", fn: d => d?.returns?.d30 != null ? `${d.returns.d30 >= 0 ? "+" : ""}${d.returns.d30.toFixed(2)}%` : "—", colorFn: d => (d?.returns?.d30 || 0) >= 0 ? "#00ff88" : "#ff4466" },
              { label: "100D Return", fn: d => d?.returns?.d100 != null ? `${d.returns.d100 >= 0 ? "+" : ""}${d.returns.d100.toFixed(2)}%` : "—", colorFn: d => (d?.returns?.d100 || 0) >= 0 ? "#00ff88" : "#ff4466" },
              { label: "RSI (14)", fn: d => d ? d.rsi.toFixed(1) : "—", colorFn: d => d?.rsi > 70 ? "#ff4466" : d?.rsi < 30 ? "#00ff88" : "#ffaa00" },
              { label: "SMA 20", fn: d => d?.sma20 ? `₹${d.sma20.toFixed(0)}` : "—" },
              { label: "SMA 50", fn: d => d?.sma50 ? `₹${d.sma50.toFixed(0)}` : "—" },
              { label: "SMA 200", fn: d => d?.sma200 ? `₹${d.sma200.toFixed(0)}` : "—" },
              { label: "Price vs SMA200", fn: d => d ? (d.current > d.sma200 ? "ABOVE ▲" : "BELOW ▼") : "—", colorFn: d => d?.current > d?.sma200 ? "#00ff88" : "#ff4466" },
              { label: "52W Position", fn: d => d ? `${d.posIn52W.toFixed(1)}%` : "—", colorFn: d => d?.posIn52W > 75 ? "#ff4466" : d?.posIn52W < 30 ? "#00ff88" : "#ffaa00" },
              { label: "52W High", fn: d => d ? `₹${d.high52.toFixed(0)}` : "—" },
              { label: "52W Low", fn: d => d ? `₹${d.low52.toFixed(0)}` : "—" },
              { label: "Volume Ratio", fn: d => d ? `${d.volRatio.toFixed(2)}×` : "—", colorFn: d => d?.volRatio > 1.5 ? "#ffaa00" : "#2a5a8a" },
              { label: "Momentum Score", fn: d => d ? `${d.momentumScore.toFixed(0)}/100` : "—", colorFn: d => d?.momentumScore > 60 ? "#00ff88" : d?.momentumScore > 40 ? "#ffaa00" : "#ff4466" },
              { label: "MA Cross Signal", fn: d => d ? (d.crossSignal === "NONE" ? "—" : d.crossSignal) : "—", colorFn: d => d?.crossSignal === "GOLDEN" ? "#00ff88" : d?.crossSignal === "DEATH" ? "#ff4466" : "#2a5a8a" },
            ].map((row, i) => {
              const vals = compareList.map(s => stockData[s.symbol]);
              // Highlight winner
              return (
                <div key={row.label} style={{
                  display: "grid", gridTemplateColumns: "180px 1fr 1fr",
                  borderBottom: "1px solid #06101a",
                  background: i % 2 === 0 ? "transparent" : "rgba(6,10,14,0.5)",
                }}>
                  <div style={{ padding: "9px 14px", color: "#2a5a8a", fontSize: "11px" }}>{row.label}</div>
                  {vals.map((d, idx) => (
                    <div key={idx} style={{ padding: "9px 14px", color: row.colorFn ? row.colorFn(d) : "#8aaccc", fontSize: "11px", fontWeight: "500" }}>
                      {row.fn(d)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Mini charts side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
            {compareList.map(s => {
              const d = stockData[s.symbol];
              return (
                <div key={s.symbol} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ color: "#fff", fontSize: "13px", fontWeight: "600" }}>{s.short}</div>
                    {d && <div style={{ color: d.changePct >= 0 ? "#00ff88" : "#ff4466", fontSize: "12px" }}>
                      {d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%
                    </div>}
                  </div>
                  {d ? <SparkLine history={d.history} change={d.change} width={300} height={60} /> : <div style={{ color: "#1a3a5a", animation: "pulse 1.5s infinite" }}>Loading...</div>}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "14px", color: "#0d2035", fontSize: "10px", textAlign: "center" }}>
            All data from Yahoo Finance · 15-min delayed · Technical analysis only · Not financial advice
          </div>
        </div>
      )}
    </div>
  );
}
