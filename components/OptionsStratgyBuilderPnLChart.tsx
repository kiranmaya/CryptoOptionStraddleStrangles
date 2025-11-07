// P&L Chart with Live Price Updates via WebSocket and Interactive Features

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

interface TooltipData {
  x: number;
  y: number;
  price: number;
  pnl: number;
  isVisible: boolean;
}

export const SimplePnLChart: React.FC<SimplePnLChartProps> = ({
  positions
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
  const [tooltip, setTooltip] = useState<TooltipData>({ x: 0, y: 0, price: 0, pnl: 0, isVisible: false });
  const [hoveredPoint, setHoveredPoint] = useState<{ btcPrice: number; pnl: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [chartScale, setChartScale] = useState({ min: 0, max: 0, points: 100 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  
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

  // Calculate nearest data point to mouse position
  const getNearestDataPoint = useCallback((
    mouseX: number,
    mouseY: number,
    scale: { min: number; max: number; points: number },
    margin: { top: number; right: number; bottom: number; left: number },
    chartWidth: number,
    chartHeight: number
  ): { btcPrice: number; pnl: number } | null => {
    if (pnlData.length === 0) return null;
    
    // Convert mouse position to data coordinates
    const minPrice = chartScale.min;
    const maxPrice = chartScale.max;
    const minPnl = Math.min(...pnlData.map(d => d.pnl));
    const maxPnl = Math.max(...pnlData.map(d => d.pnl));
    
    const pnlPadding = (maxPnl - minPnl) * 0.1;
    const adjustedMinPnl = minPnl - pnlPadding;
    const adjustedMaxPnl = maxPnl + pnlPadding;
    
    const xToPrice = (x: number) => {
      const relativeX = (x - margin.left) / chartWidth;
      return minPrice + relativeX * (maxPrice - minPrice);
    };
    
    const yToPnl = (y: number) => {
      const relativeY = (margin.top + chartHeight - y) / chartHeight;
      return adjustedMinPnl + relativeY * (adjustedMaxPnl - adjustedMinPnl);
    };
    
    const mousePrice = xToPrice(mouseX);
    
    // Find nearest data point
    let nearestPoint: { btcPrice: number; pnl: number } | null = null;
    let minDistance = Infinity;
    
    pnlData.forEach(point => {
      const pointX = margin.left + ((point.btcPrice - minPrice) / (maxPrice - minPrice)) * chartWidth;
      const pointY = margin.top + chartHeight - ((point.pnl - adjustedMinPnl) / (adjustedMaxPnl - adjustedMinPnl)) * chartHeight;
      
      const distance = Math.sqrt(
        Math.pow(mouseX - pointX, 2) + Math.pow(mouseY - pointY, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    });
    
    return nearestPoint;
  }, [pnlData, chartScale]);

  // Handle mouse move
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Check if mouse is within chart area
    const margin = { top: 20, right: 50, bottom: 40, left: 80 };
    const chartWidth = rect.width - margin.left - margin.right;
    const chartHeight = rect.height - margin.top - margin.bottom;
    
    if (mouseX < margin.left || mouseX > margin.left + chartWidth ||
        mouseY < margin.top || mouseY > margin.top + chartHeight) {
      setTooltip(prev => ({ ...prev, isVisible: false }));
      setHoveredPoint(null);
      return;
    }
    
    const nearestPoint = getNearestDataPoint(mouseX, mouseY, chartScale, margin, chartWidth, chartHeight);
    
    if (nearestPoint) {
      setHoveredPoint(nearestPoint);
      setTooltip({
        x: mouseX,
        y: mouseY,
        price: nearestPoint.btcPrice,
        pnl: nearestPoint.pnl,
        isVisible: true
      });
    } else {
      setTooltip(prev => ({ ...prev, isVisible: false }));
      setHoveredPoint(null);
    }
  }, [getNearestDataPoint, chartScale]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, isVisible: false }));
    setHoveredPoint(null);
  }, []);

  // Handle mouse down for panning
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
  }, []);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle wheel for zooming
  const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    
    const delta = event.deltaY > 0 ? 1.1 : 0.9; // Zoom in or out
    const newZoomLevel = Math.max(0.1, Math.min(5, zoomLevel * delta));
    setZoomLevel(newZoomLevel);
    
    // Recalculate chart scale based on new zoom
    if (btcPrice > 0) {
      const range = btcPrice * 0.1 * newZoomLevel; // 10% range base, scaled by zoom
      setChartScale({
        min: btcPrice - range,
        max: btcPrice + range,
        points: 100
      });
    }
  }, [zoomLevel, btcPrice]);

  // Handle click on chart
  const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Check if click is within chart area and near a breakeven point
    const margin = { top: 20, right: 50, bottom: 40, left: 80 };
    const chartWidth = rect.width - margin.left - margin.right;
    const chartHeight = rect.height - margin.top - margin.bottom;
    
    if (clickX < margin.left || clickX > margin.left + chartWidth ||
        clickY < margin.top || clickY > margin.top + chartHeight) {
      return;
    }
    
    // Find breakeven points
    const minPnl = Math.min(...pnlData.map(d => d.pnl));
    const maxPnl = Math.max(...pnlData.map(d => d.pnl));
    const pnlPadding = (maxPnl - minPnl) * 0.1;
    const adjustedMinPnl = minPnl - pnlPadding;
    const adjustedMaxPnl = maxPnl + pnlPadding;
    
    const breakevenPoints = pnlData.filter(point => 
      Math.abs(point.pnl) < (adjustedMaxPnl - adjustedMinPnl) * 0.01
    );
    
    // Check if click is near any breakeven point
    let clickedBreakeven = false;
    breakevenPoints.forEach(point => {
      const pointX = margin.left + ((point.btcPrice - chartScale.min) / (chartScale.max - chartScale.min)) * chartWidth;
      const pointY = margin.top + chartHeight - ((point.pnl - adjustedMinPnl) / (adjustedMaxPnl - adjustedMinPnl)) * chartHeight;
      
      const distance = Math.sqrt(
        Math.pow(clickX - pointX, 2) + Math.pow(clickY - pointY, 2)
      );
      
      if (distance < 10) { // Within 10 pixels
        clickedBreakeven = true;
        // You could add additional actions here, like showing detailed info
        console.log('Clicked breakeven point at BTC price:', point.btcPrice);
      }
    });
    
    if (!clickedBreakeven) {
      // Convert click to BTC price and show info
      const relativeX = (clickX - margin.left) / chartWidth;
      const clickedPrice = chartScale.min + relativeX * (chartScale.max - chartScale.min);
      console.log('Clicked at BTC price:', clickedPrice);
    }
  }, [pnlData, chartScale]);

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
        // Use current chart scale or default range
        const range = chartScale.min === 0 && chartScale.max === 0 
          ? { min: btcPrice * 0.95, max: btcPrice * 1.05, points: 100 }
          : chartScale;

        // Use live prices if available, otherwise fall back to current BTC price
        const pricesToUse = positions.map(position => ({
          position,
          price: getLivePrice(position.symbol) || btcPrice
        }));

        const curve = generatePortfolioPnLCurve(positions, range);
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
  }, [positions, btcPrice, getLivePrice, chartScale]);

  // Initialize chart scale
  useEffect(() => {
    if (btcPrice > 0 && chartScale.min === 0 && chartScale.max === 0) {
      const range = btcPrice * 0.05; // 5% range
      setChartScale({
        min: btcPrice - range,
        max: btcPrice + range,
        points: 100
      });
    }
  }, [btcPrice, chartScale]);

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
    const minPrice = chartScale.min;
    const maxPrice = chartScale.max;
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
      const currentCurve = generatePortfolioPnLCurve(positions, { 
        min: btcPrice, 
        max: btcPrice, 
        points: 1 
      });
      const currentY = pnlToY(currentCurve[0]?.pnl || 0);
      
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

    // Highlight hovered point
    if (hoveredPoint) {
      const hoverX = priceToX(hoveredPoint.btcPrice);
      const hoverY = pnlToY(hoveredPoint.pnl);
      
      // Draw highlight circle
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.arc(hoverX, hoverY, 12, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hoverX, hoverY, 12, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Draw center point
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(hoverX, hoverY, 4, 0, 2 * Math.PI);
      ctx.fill();
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

    // Add zoom level indicator
    if (zoomLevel !== 1) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Zoom: ${zoomLevel.toFixed(1)}x`, rect.width - 10, 20);
    }

  }, [pnlData, btcPrice, positions, hoveredPoint, zoomLevel, chartScale]);

  const getPortfolioDescription = () => {
    if (positions.length === 0) {
      return 'Portfolio profit/loss at different BTC price levels';
    }
    const { totalUnrealizedPnl, totalMargin, longPositions, shortPositions } = portfolioSummary;
    return `Net P&L: ${formatPnl(totalUnrealizedPnl)} | Margin: ${formatPnl(totalMargin)} | ${longPositions}L/${shortPositions}S`;
  };

  // Reset zoom function
  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    if (btcPrice > 0) {
      const range = btcPrice * 0.05; // 5% range
      setChartScale({
        min: btcPrice - range,
        max: btcPrice + range,
        points: 100
      });
    }
  }, [btcPrice]);

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
    <div className="bg-white rounded-lg shadow-sm border" ref={containerRef}>
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
          
          {/* Chart Controls */}
          <div className="flex items-center space-x-2">
            {zoomLevel !== 1 && (
              <button
                onClick={resetZoom}
                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
              >
                Reset Zoom
              </button>
            )}
            
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
              className="w-full h-96 rounded-lg border border-gray-200 cursor-crosshair"
              style={{ height: '400px' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              onClick={handleClick}
            />
            
            {/* Interactive Tooltip */}
            {tooltip.isVisible && (
              <div 
                className="absolute bg-gray-900 text-white p-2 rounded shadow-lg text-xs pointer-events-none z-10"
                style={{
                  left: tooltip.x + 10,
                  top: tooltip.y - 40,
                  transform: tooltip.x > 300 ? 'translateX(-100%)' : 'translateX(0)'
                }}
              >
                <div className="font-medium">BTC Price: ${tooltip.price.toLocaleString()}</div>
                <div className={`font-semibold ${tooltip.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  P&L: {formatPnl(tooltip.pnl)}
                </div>
                <div className="text-gray-300 text-xs">
                  {hoveredPoint && `ROI: ${((tooltip.pnl / Math.max(...positions.map(p => p.entryPrice * p.quantity))) * 100).toFixed(2)}%`}
                </div>
              </div>
            )}

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

            {/* Interaction Instructions */}
            <div className="absolute bottom-4 left-4 bg-white bg-opacity-80 backdrop-blur-sm rounded p-2 text-xs text-gray-600">
              <div>🖱️ Hover: View P&L at price</div>
              <div>🖱️ Click: Explore breakeven points</div>
              <div>🔍 Scroll: Zoom in/out</div>
              {zoomLevel !== 1 && <div>📊 Current zoom: {zoomLevel.toFixed(1)}x</div>}
            </div>
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
              <span className="ml-1 text-lg font-semibold text-gray-900">{portfolioSummary.totalPositions}</span>
            </div>
            <div>
              <span className="text-gray-600">Unrealized P&L:</span>
              <span className={`ml-1 text-lg font-semibold ${
                portfolioSummary.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatPnl(portfolioSummary.totalUnrealizedPnl)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Required Margin:</span>
              <span className="ml-1 text-lg font-semibold text-gray-900">
                {formatPnl(portfolioSummary.totalMargin)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Position Mix:</span>
              <span className="ml-1 text-lg font-semibold text-gray-900">
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
            <p className="mt-2"><strong>Interactive Features:</strong> Hover over the chart to see exact P&L values at any price point. Click on breakeven points for detailed analysis. Use mouse wheel to zoom in/out for different price ranges. The blue highlight shows your current hover position.</p>
          </div>
        </div>
      )}
    </div>
  );
};