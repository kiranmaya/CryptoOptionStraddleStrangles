// P&L Chart with Live Price Updates via WebSocket

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBTCPrice } from '../utils/deltaApi';
import { calculatePortfolioSummary, formatPnl, generatePortfolioPnLCurve, Position } from '../utils/positionManager';
import { useDeltaWebSocket } from '../utils/websocketClient';

interface LivePrice {
  symbol: string;
  price: number;
  timestamp: number;
}

interface SimplePnLChartProps {
  positions: Position[];
}

export const SimplePnLChart: React.FC<SimplePnLChartProps> = ({
  positions
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [btcPrice, setBtcPrice] = useState<number>(0);
  const [pnlData, setPnlData] = useState<Array<{ btcPrice: number; pnl: number }>>([]);
  const [portfolioSummary, setPortfolioSummary] = useState({
    totalPositions: 0,
    totalUnrealizedPnl: 0,
    totalMargin: 0,
    longPositions: 0,
    shortPositions: 0
  });
  const [loading, setLoading] = useState(false);
  const [livePrices, setLivePrices] = useState<Map<string, LivePrice>>(new Map());
  const [strikeSymbols, setStrikeSymbols] = useState<string[]>([]);
  
  // WebSocket hook
  const { connected, subscribeMarkPrices, onMessage, offMessage } = useDeltaWebSocket();

  // Generate strike symbols from positions
  const generateStrikeSymbols = useCallback((positions: Position[]): string[] => {
    const symbols = new Set<string>();
    
    // Add BTC price tracking
    symbols.add('BTCUSD');
    
    positions.forEach(position => {
      // For options, generate symbols in the format like C-BTC-90000-310125
      if (position.type === 'call') {
        symbols.add(`C-BTC-${position.strike}-${getNextFriday()}`);
        symbols.add(`P-BTC-${position.strike}-${getNextFriday()}`); // Also get put prices for reference
      } else if (position.type === 'put') {
        symbols.add(`P-BTC-${position.strike}-${getNextFriday()}`);
        symbols.add(`C-BTC-${position.strike}-${getNextFriday()}`); // Also get call prices for reference
      }
    });
    
    return Array.from(symbols);
  }, []);

  // Get next Friday date in YYMMDD format
  const getNextFriday = useCallback((): string => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
    
    const year = nextFriday.getFullYear().toString().slice(-2);
    const month = (nextFriday.getMonth() + 1).toString().padStart(2, '0');
    const day = nextFriday.getDate().toString().padStart(2, '0');
    
    return `${year}${month}${day}`;
  }, []);

  // Handle price updates from WebSocket
  const handlePriceUpdate = useCallback((data: unknown) => {
    const payload = data as Record<string, unknown>;
    
    // Handle different payload structures
    if (payload.symbol && payload.price) {
      const symbol = String(payload.symbol);
      const price = Number(payload.price);
      const timestamp = Date.now();
      
      const update: LivePrice = { symbol, price, timestamp };
      setLivePrices(prev => new Map(prev).set(symbol, update));
      
      // Update BTC price if we get BTCUSD price
      if (symbol === 'BTCUSD' && price > 0) {
        setBtcPrice(price);
      }
    }
  }, []);

  // Subscribe to mark prices for all relevant symbols
  useEffect(() => {
    let symbols = ['BTCUSD']; // Always include BTC price
    
    if (positions.length > 0) {
      // Add position-based symbols
      symbols.push(...generateStrikeSymbols(positions));
    } else {
      // Always subscribe to common popular option symbols around current BTC price
      const currentPrice = btcPrice > 0 ? btcPrice : 67000; // Default BTC price
      const expiryDate = getNextFriday();
      
      // Generate strikes around current price (±20%)
      const strikes: number[] = [];
      for (let offset = -20; offset <= 20; offset += 5) {
        const strike = Math.round(currentPrice * (1 + offset / 100) / 1000) * 1000;
        if (strike > 0 && !strikes.includes(strike)) {
          strikes.push(strike);
        }
      }
      
      strikes.forEach(strike => {
        symbols.push(`C-BTC-${strike}-${expiryDate}`);
        symbols.push(`P-BTC-${strike}-${expiryDate}`);
      });
    }
    
    // Remove duplicates and limit to reasonable number
    symbols = Array.from(new Set(symbols)).slice(0, 50);
    setStrikeSymbols(symbols);
    
    if (symbols.length > 0) {
      subscribeMarkPrices(symbols);
    }
  }, [positions, generateStrikeSymbols, subscribeMarkPrices, getNextFriday, btcPrice]);

  // Set up message handlers
  useEffect(() => {
    if (connected && strikeSymbols.length > 0) {
      onMessage('mark_price', handlePriceUpdate);
      
      return () => {
        offMessage('mark_price', handlePriceUpdate);
      };
    }
  }, [connected, strikeSymbols, handlePriceUpdate, onMessage, offMessage]);

  // Load initial BTC price as fallback
  useEffect(() => {
    if (btcPrice === 0) {
      const loadBtcPrice = async () => {
        try {
          const price = await fetchBTCPrice();
          setBtcPrice(price);
        } catch (err) {
          console.error('Error fetching BTC price:', err);
        }
      };
      loadBtcPrice();
    }
  }, [btcPrice]);

  // Get current live price for a symbol
  const getLivePrice = useCallback((symbol: string): number => {
    const livePrice = livePrices.get(symbol);
    return livePrice?.price || 0;
  }, [livePrices]);

  // Generate P&L curve when positions or BTC price changes
  useEffect(() => {
    if (positions.length === 0) {
      setPnlData([]);
      setPortfolioSummary({
        totalPositions: 0,
        totalUnrealizedPnl: 0,
        totalMargin: 0,
        longPositions: 0,
        shortPositions: 0
      });
      return;
    }

    if (btcPrice > 0) {
      setLoading(true);
      try {
        // Calculate price range around current BTC price (5% range)
        const minPrice = btcPrice * 0.95; // 5% below current price
        const maxPrice = btcPrice * 1.05; // 5% above current price
        const points = 100; // More data points for smooth curve

        const priceRange = { min: minPrice, max: maxPrice, points };
        
        // Use live prices if available, otherwise fall back to current BTC price
        const pricesToUse = positions.map(position => ({
          position,
          price: getLivePrice(position.symbol) || btcPrice
        }));

        const curve = generatePortfolioPnLCurve(positions, priceRange);
        setPnlData(curve);

        // Calculate portfolio summary using live prices
        const summary = calculatePortfolioSummary(positions, btcPrice);
        setPortfolioSummary({
          totalPositions: summary.totalPositions,
          totalUnrealizedPnl: summary.totalUnrealizedPnl,
          totalMargin: summary.totalMargin,
          longPositions: summary.longPositions,
          shortPositions: summary.shortPositions
        });
      } catch (err) {
        console.error('Error generating P&L curve:', err);
      } finally {
        setLoading(false);
      }
    }
  }, [positions, btcPrice, getLivePrice]);

  // Draw the chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pnlData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Chart margins
    const margin = { top: 20, right: 50, bottom: 40, left: 80 };
    const chartWidth = rect.width - margin.left - margin.right;
    const chartHeight = rect.height - margin.top - margin.bottom;

    // Calculate scale factors
    const minPrice = Math.min(...pnlData.map(d => d.btcPrice));
    const maxPrice = Math.max(...pnlData.map(d => d.btcPrice));
    const minPnl = Math.min(...pnlData.map(d => d.pnl));
    const maxPnl = Math.max(...pnlData.map(d => d.pnl));

    // Add some padding to P&L range
    const pnlPadding = (maxPnl - minPnl) * 0.1;
    const adjustedMinPnl = minPnl - pnlPadding;
    const adjustedMaxPnl = maxPnl + pnlPadding;

    // Scale functions
    const priceToX = (price: number) => margin.left + ((price - minPrice) / (maxPrice - minPrice)) * chartWidth;
    const pnlToY = (pnl: number) => margin.top + chartHeight - ((pnl - adjustedMinPnl) / (adjustedMaxPnl - adjustedMinPnl)) * chartHeight;

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    // Vertical grid lines (price levels)
    const priceStep = (maxPrice - minPrice) / 10;
    for (let i = 0; i <= 10; i++) {
      const price = minPrice + priceStep * i;
      const x = priceToX(price);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + chartHeight);
      ctx.stroke();
    }
    
    // Horizontal grid lines (P&L levels)
    const pnlStep = (adjustedMaxPnl - adjustedMinPnl) / 8;
    for (let i = 0; i <= 8; i++) {
      const pnl = adjustedMinPnl + pnlStep * i;
      const y = pnlToY(pnl);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + chartWidth, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + chartHeight);
    ctx.stroke();
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartHeight);
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
    ctx.stroke();

    // Draw zero P&L line
    if (adjustedMinPnl < 0 && adjustedMaxPnl > 0) {
      const zeroY = pnlToY(0);
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(margin.left + chartWidth, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw P&L curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    pnlData.forEach((point, index) => {
      const x = priceToX(point.btcPrice);
      const y = pnlToY(point.pnl);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Mark breakeven points
    const breakevenPoints = pnlData.filter(point => Math.abs(point.pnl) < (adjustedMaxPnl - adjustedMinPnl) * 0.01);
    ctx.fillStyle = '#ef4444';
    breakevenPoints.forEach(point => {
      const x = priceToX(point.btcPrice);
      const y = pnlToY(point.pnl);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Mark current BTC price position
    if (btcPrice >= minPrice && btcPrice <= maxPrice) {
      const currentX = priceToX(btcPrice);
      const currentY = pnlToY(generatePortfolioPnLCurve(positions, { 
        min: btcPrice, 
        max: btcPrice, 
        points: 1 
      })[0]?.pnl || 0);
      
      // Draw current price vertical line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(currentX, margin.top);
      ctx.lineTo(currentX, margin.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw current P&L point
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(currentX, currentY, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Add labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    // X-axis labels (price levels)
    for (let i = 0; i <= 10; i++) {
      const price = minPrice + priceStep * i;
      const x = priceToX(price);
      ctx.fillText(`$${Math.round(price).toLocaleString()}`, x, margin.top + chartHeight + 20);
    }

    // Y-axis labels (P&L levels)
    ctx.textAlign = 'right';
    for (let i = 0; i <= 8; i++) {
      const pnl = adjustedMinPnl + pnlStep * i;
      const y = pnlToY(pnl);
      ctx.fillText(formatPnl(pnl), margin.left - 10, y + 4);
    }

    // Axis titles
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Inter, system-ui, sans-serif';
    ctx.fillText('BTC Price ($)', margin.left + chartWidth / 2, margin.top + chartHeight + 35);
    
    ctx.save();
    ctx.translate(20, margin.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('P&L ($)', 0, 0);
    ctx.restore();

  }, [pnlData, btcPrice, positions]);

  const getPortfolioDescription = () => {
    if (positions.length === 0) {
      return 'Portfolio profit/loss at different BTC price levels';
    }
    const { totalUnrealizedPnl, totalMargin, longPositions, shortPositions } = portfolioSummary;
    return `Net P&L: ${formatPnl(totalUnrealizedPnl)} | Margin: ${formatPnl(totalMargin)} | ${longPositions}L/${shortPositions}S`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Portfolio P&L Chart</h2>
          <p className="text-sm text-gray-600 mt-1">Portfolio profit/loss at different BTC price levels</p>
        </div>
        <div className="p-4">
          <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Calculating P&L curve...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Portfolio P&L Chart
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {getPortfolioDescription()}
            </p>
          </div>
          
          {/* Current BTC Price & Connection Status */}
          <div className="text-right text-sm">
            <div className="font-medium text-gray-900">
              BTC: ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-end space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <div className="text-gray-600">
                {connected ? 'Live' : 'Disconnected'}
              </div>
            </div>
            <div className="text-gray-600">
              X-axis: BTC Price, Y-axis: P&L
            </div>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-4">
        {positions.length === 0 ? (
          <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
              </svg>
              <p className="text-gray-600 font-medium">No Positions</p>
              <p className="text-gray-500 text-sm mt-1">
                Use the Buy/Sell buttons in the option table to start building your portfolio
              </p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-full h-96 rounded-lg border border-gray-200"
              style={{ height: '400px' }}
            />
            
            {/* Interactive overlay for current P&L at BTC price */}
            {btcPrice > 0 && (
              <div className="absolute top-4 right-4 bg-white bg-opacity-90 backdrop-blur-sm rounded-lg p-3 shadow-lg border">
                <div className="text-xs space-y-1">
                  <div className="font-medium text-gray-900">
                    Current P&L
                  </div>
                  <div className={`font-semibold ${
                    portfolioSummary.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPnl(portfolioSummary.totalUnrealizedPnl)}
                  </div>
                  <div className="text-gray-600">
                    at BTC ${btcPrice.toLocaleString()}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {connected ? 'Live data' : 'Static data'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Prices Summary - Always show when connected */}
      {connected && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Live Option Prices:</h4>
          {livePrices.size > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs max-h-48 overflow-y-auto">
              {Array.from(livePrices.entries())
                .filter(([symbol]) => symbol !== 'BTCUSD')
                .slice(0, 24) // Show more live prices
                .map(([symbol, priceData]) => (
                  <div key={symbol} className="bg-white p-2 rounded border hover:shadow-sm transition-shadow">
                    <div className="font-mono text-gray-800 truncate">{symbol}</div>
                    <div className="font-semibold text-gray-900">
                      ${priceData.price.toFixed(4)}
                    </div>
                    <div className="text-gray-500 text-xs">
                      {new Date(priceData.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3 mx-auto"></div>
              </div>
              <p className="text-sm">Loading live option prices...</p>
            </div>
          )}
        </div>
      )}

      {/* Portfolio Summary */}
      {positions.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Positions:</span>
              <span className="ml-1 font-medium text-gray-900">{portfolioSummary.totalPositions}</span>
            </div>
            <div>
              <span className="text-gray-600">Unrealized P&L:</span>
              <span className={`ml-1 font-medium ${
                portfolioSummary.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatPnl(portfolioSummary.totalUnrealizedPnl)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Required Margin:</span>
              <span className="ml-1 font-medium text-gray-900">
                {formatPnl(portfolioSummary.totalMargin)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Position Mix:</span>
              <span className="ml-1 font-medium text-gray-900">
                {portfolioSummary.longPositions}L / {portfolioSummary.shortPositions}S
              </span>
            </div>
          </div>
          
          {/* Position Details */}
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-900">Active Positions:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {positions.map((position) => {
                const livePrice = getLivePrice(position.symbol);
                return (
                  <div 
                    key={position.id} 
                    className={`p-2 rounded border text-xs ${
                      position.position === 'long' 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-gray-800">
                        {position.symbol}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        position.position === 'long'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {position.position.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-gray-600 mt-1">
                      {position.type.toUpperCase()} ${position.strike} × {position.quantity}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">
                        Entry: {formatPnl(position.entryPrice)}
                      </div>
                      {livePrice > 0 && (
                        <div className="text-right">
                          <div className="text-gray-900 font-medium">
                            Live: {formatPnl(livePrice)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="text-xs text-gray-600 mt-4 pt-3 border-t border-gray-200">
            <p><strong>How to read this chart:</strong> The X-axis shows BTC price levels, the Y-axis shows your portfolio P&L at each price. The curve shows how your positions would perform if BTC reaches different price levels. Red dots mark breakeven points where P&L = $0. The orange vertical line shows the current BTC price, and the orange dot shows your current P&L. Option prices are updated in real-time via WebSocket when connected.</p>
          </div>
        </div>
      )}
    </div>
  );
};