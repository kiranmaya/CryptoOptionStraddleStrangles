// Strategy Builder Chart Component for P&L Visualization

import {
  ColorType,
  createChart,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineSeries,
  UTCTimestamp
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { fetchBTCPrice } from '../utils/deltaApi';
import { Position } from '../utils/positionManager';

interface StrategyBuilderChartProps {
  selections: Selection[];
  positions: Position[];
}

export const StrategyBuilderChart: React.FC<StrategyBuilderChartProps> = ({
  selections
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pnlSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const breakevenLinesRef = useRef<IPriceLine[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [btcPrice, setBtcPrice] = useState<number>(0);
  const [currentStrategy, setCurrentStrategy] = useState<StrategyInfo>({
    name: 'No Strategy',
    type: 'custom',
    description: 'No options selected',
    isLong: true,
    maxProfit: 0,
    maxLoss: 0,
    breakevenPoints: []
  });
  const [pnlData, setPnlData] = useState<PnLDataPoint[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const resolveTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      background: isDark ? '#1e293b' : '#ffffff',
      text: isDark ? '#e2e8f0' : '#0f172a',
      grid: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
      paneSeparator: isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.35)',
    };
  };

  // Load current BTC price
  useEffect(() => {
    const loadBtcPrice = async () => {
      try {
        const price = await fetchBTCPrice();
        setBtcPrice(price);
      } catch (err) {
        console.error('Error fetching BTC price:', err);
        setError('Failed to fetch current BTC price');
      }
    };

    loadBtcPrice();
  }, []);

  // Update strategy detection and P&L calculation when selections change
  useEffect(() => {
    if (selections.length === 0) {
      setCurrentStrategy({
        name: 'No Strategy',
        type: 'custom',
        description: 'No options selected',
        isLong: true,
        maxProfit: 0,
        maxLoss: 0,
        breakevenPoints: []
      });
      setPnlData([]);
      return;
    }

    // Detect strategy type
    const strategy = detectStrategy(selections);
    setCurrentStrategy(strategy);

    // Generate P&L curve if we have a valid BTC price
    if (btcPrice > 0) {
      setLoading(true);
      try {
        const priceRange = calculatePriceRange(selections, btcPrice);
        const curve = generatePnLCurve(selections, priceRange, btcPrice);
        setPnlData(curve);
      } catch (err) {
        console.error('Error generating P&L curve:', err);
        setError('Failed to generate P&L curve');
      } finally {
        setLoading(false);
      }
    }
  }, [selections, btcPrice]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const theme = resolveTheme();

    // Initialize chart
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 400,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#C3BCDB44',
          labelBackgroundColor: '#9B7DFF',
        },
        horzLine: {
          color: '#9B7DFF',
          labelBackgroundColor: '#9B7DFF',
        },
      },
      rightPriceScale: {
        borderColor: theme.paneSeparator,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: theme.paneSeparator,
        timeVisible: false,
        secondsVisible: false,
      },
    });

    // Add P&L line series
    const pnlSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      priceLineVisible: true,
      title: 'P&L',
    });

    chartRef.current = chart;
    pnlSeriesRef.current = pnlSeries;

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === container) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            chart.applyOptions({
              width: Math.floor(width),
              height: Math.floor(height),
            });
          }
        }
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update chart data when P&L data changes
  useEffect(() => {
    if (!pnlSeriesRef.current || pnlData.length === 0) return;

    const formattedData = pnlData.map(point => ({
      time: point.price as UTCTimestamp,
      value: point.pnl,
    }));

    pnlSeriesRef.current.setData(formattedData);

    // Update breakeven lines
    if (currentStrategy.breakevenPoints.length > 0 && pnlSeriesRef.current) {
      // Remove existing breakeven lines
      breakevenLinesRef.current.forEach((line) => {
        try {
          pnlSeriesRef.current!.removePriceLine(line);
        } catch (err) {
          console.warn('Error removing price line:', err);
        }
      });
      breakevenLinesRef.current = [];

      // Add new breakeven lines
      currentStrategy.breakevenPoints.forEach(breakeven => {
        try {
          const breakevenLine = pnlSeriesRef.current!.createPriceLine({
            price: breakeven,
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: 1, // Dashed
            axisLabelVisible: true,
            title: `Breakeven: $${breakeven.toLocaleString()}`,
          });
          breakevenLinesRef.current.push(breakevenLine);
        } catch (err) {
          console.warn('Error creating breakeven line:', err);
        }
      });
    }

    // Auto-scale chart
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
      const panes = chartRef.current.panes();
      if (panes.length > 0) {
        panes[0].priceScale('right').applyOptions({ autoScale: true });
      }
    }
  }, [pnlData, currentStrategy]);

  const getStrategyDescription = () => {
    if (selections.length === 0) {
      return 'Select options from the option chain to visualize P&L patterns';
    }
    return currentStrategy.description;
  };

  const getStrategyStats = () => {
    if (selections.length === 0) return null;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
        <div>
          <span className="text-gray-600">Strategy:</span>
          <span className="ml-1 font-medium text-gray-900">{currentStrategy.name}</span>
        </div>
        <div>
          <span className="text-gray-600">Max Profit:</span>
          <span className="ml-1 font-medium text-green-600">
            {currentStrategy.maxProfit === 'unlimited' 
              ? 'Unlimited' 
              : formatPnL(currentStrategy.maxProfit as number)}
          </span>
        </div>
        <div>
          <span className="text-gray-600">Max Loss:</span>
          <span className="ml-1 font-medium text-red-600">
            {currentStrategy.maxLoss === 'unlimited' 
              ? 'Unlimited' 
              : formatPnL(currentStrategy.maxLoss as number)}
          </span>
        </div>
        <div>
          <span className="text-gray-600">Breakeven Points:</span>
          <span className="ml-1 font-medium text-gray-900">
            {currentStrategy.breakevenPoints.length > 0 
              ? currentStrategy.breakevenPoints.map(p => `$${p.toLocaleString()}`).join(', ')
              : 'N/A'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Strategy P&L Builder
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {getStrategyDescription()}
            </p>
          </div>
          
          {/* Strategy Info */}
          <div className="text-right text-sm">
            <div className="font-medium text-gray-900">
              {selections.length} option{selections.length !== 1 ? 's' : ''} selected
            </div>
            <div className="text-gray-600">
              {selections.filter(s => s.type === 'call').length} calls, {selections.filter(s => s.type === 'put').length} puts
            </div>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-4">
        {error ? (
          <div className="h-96 flex items-center justify-center bg-red-50 rounded-lg">
            <div className="text-center">
              <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-700 font-medium">Chart Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          </div>
        ) : loading ? (
          <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Generating P&L curve...</p>
            </div>
          </div>
        ) : (
          <div
            ref={chartContainerRef}
            className="h-96 w-full rounded-lg border border-gray-200"
          />
        )}
      </div>

      {/* Strategy Stats */}
      {getStrategyStats()}

      {/* Strategy Information */}
      {selections.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            <p><strong>Current BTC Price:</strong> ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            <p className="mt-1">
              <strong>How to read this chart:</strong> The P&L curve shows theoretical profit/loss at expiration for different underlying prices. 
              Positive values indicate profit, negative values indicate loss.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};