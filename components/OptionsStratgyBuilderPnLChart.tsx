// Simple P&L Chart with Price on X-axis

import { useEffect, useRef, useState } from 'react';
import { fetchBTCPrice } from '../utils/deltaApi';
import { calculatePortfolioSummary, formatPnl, generatePortfolioPnLCurve, Position } from '../utils/positionManager';

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

  // Load current BTC price
  useEffect(() => {
    const loadBtcPrice = async () => {
      try {
        const price = await fetchBTCPrice();
        setBtcPrice(price);
      } catch (err) {
        console.error('Error fetching BTC price:', err);
      }
    };
    loadBtcPrice();
  }, []);

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
        const curve = generatePortfolioPnLCurve(positions, priceRange);
        setPnlData(curve);

        // Calculate portfolio summary
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
  }, [positions, btcPrice]);

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

  }, [pnlData, btcPrice]);

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
          
          {/* Current BTC Price */}
          <div className="text-right text-sm">
            <div className="font-medium text-gray-900">
              BTC: ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
          </div>
        )}
      </div>

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
          
          <div className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-200">
            <p><strong>How to read this chart:</strong> The X-axis shows BTC price levels, the Y-axis shows your portfolio P&L at each price. The curve shows how your positions would perform if BTC reaches different price levels. Red dots mark breakeven points where P&L = $0.</p>
          </div>
        </div>
      )}
    </div>
  );
};