// BTC Chart Component for Underlying Price Tracking

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { fetchBTCPrice, fetchCandlestickData } from '../utils/deltaApi';
import { useDeltaWebSocket } from '../utils/websocketClient';

interface BtcChartProps {
  // Optional props - if not provided, uses default values
  initialResolution?: string;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

export const BtcChart: React.FC<BtcChartProps> = ({
  initialResolution = '1'
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Array<{time: number, open: number, high: number, low: number, close: number}>>([]);
  const [resolution, setResolution] = useState(initialResolution);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);

  const { connected, subscribeMarkPrices, onMessage, offMessage } = useDeltaWebSocket();

  const resolutions = [
    { value: '1', label: '1m' },
    { value: '3', label: '3m' },
    { value: '5', label: '5m' },
    { value: '15', label: '15m' },
    { value: '30', label: '30m' },
    { value: '60', label: '1h' },
    { value: '240', label: '4h' },
    { value: '1440', label: '1d' }
  ];

  const resolveTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      background: isDark ? '#1e293b' : '#ffffff',
      text: isDark ? '#e2e8f0' : '#0f172a',
      grid: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
      paneSeparator: isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.35)',
    };
  };

  useEffect(() => {
    const container = chartContainerRef.current;

    if (!container) {
      return undefined;
    }

    const theme = resolveTheme();

    // Initialize chart
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 250,
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
      },
      rightPriceScale: {
        borderColor: theme.paneSeparator,
      },
      timeScale: {
        borderColor: theme.paneSeparator,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3b82f6',
      downColor: '#ef4444',
      borderUpColor: '#3b82f6',
      borderDownColor: '#ef4444',
      wickUpColor: '#3b82f6',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

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

    // Handle theme changes
    const themeObserver = new MutationObserver(() => {
      const nextTheme = resolveTheme();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: nextTheme.background },
          textColor: nextTheme.text,
        },
        grid: {
          vertLines: { color: nextTheme.grid },
          horzLines: { color: nextTheme.grid },
        },
        rightPriceScale: {
          borderColor: nextTheme.paneSeparator,
        },
        timeScale: {
          borderColor: nextTheme.paneSeparator,
        },
      });
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;

    if (chartData.length > 0) {
      const formattedData = chartData.map(candle => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

      seriesRef.current.setData(formattedData);
    } else {
      seriesRef.current.setData([]);
    }
  }, [chartData]);

  useEffect(() => {
    const loadBtcData = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log(`[BtcChart] Fetching BTC data with resolution: "${resolution}"`);
        
        // Fetch BTC candlestick data
        const data = await fetchCandlestickData('BTCUSD', resolution);
        
        if (data.length === 0) {
          setError('No BTC price data available');
          setChartData([]);
          return;
        }

        setChartData(data);

        // Calculate price change
        if (data.length >= 2) {
          const latest = data[data.length - 1].close;
          const previous = data[data.length - 2].close;
          const change = ((latest - previous) / previous) * 100;
          setPriceChange(change);
        }

        // Get current BTC price
        const currentBtcPrice = await fetchBTCPrice();
        setCurrentPrice(currentBtcPrice);

        // Subscribe to real-time updates
        subscribeMarkPrices(['BTCUSD']);

      } catch (err) {
        console.error('Error loading BTC data:', err);
        setError(`Failed to load BTC price data: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    loadBtcData();
  }, [resolution, subscribeMarkPrices]);

  // Handle real-time price updates
  useEffect(() => {
    const handlePriceUpdate = (update: PriceUpdate) => {
      if (!update || !update.symbol || update.symbol !== 'BTCUSD') return;

      setCurrentPrice(update.price);
      
      // Calculate change from last known price
      if (chartData.length > 0) {
        const lastPrice = chartData[chartData.length - 1].close;
        const change = ((update.price - lastPrice) / lastPrice) * 100;
        setPriceChange(change);
      }
    };

    if (connected) {
      onMessage('price', (data: unknown) => {
        const update = data as PriceUpdate;
        handlePriceUpdate(update);
      });

      return () => {
        offMessage('price', (data: unknown) => {
          const update = data as PriceUpdate;
          handlePriceUpdate(update);
        });
      };
    }
  }, [connected, onMessage, offMessage, chartData]);

  const handleResolutionChange = (newResolution: string) => {
    setResolution(newResolution);
  };

  const getPriceChangeColor = () => {
    if (priceChange > 0) return 'text-green-600';
    if (priceChange < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getPriceChangeIcon = () => {
    if (priceChange > 0) {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 6.414 6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      );
    } else if (priceChange < 0) {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 13.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Chart Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bitcoin Price</h2>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-2xl font-bold text-gray-900">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {Math.abs(priceChange) > 0.01 && (
                <span className={`text-sm font-medium flex items-center ${getPriceChangeColor()}`}>
                  {getPriceChangeIcon()}
                  {priceChange.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          
          {/* Resolution Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-900">Resolution:</span>
            <select
              value={resolution}
              onChange={(e) => handleResolutionChange(e.target.value)}
              className="text-sm border text-amber-700 border-gray-300 rounded-lg px-3 py-1 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {resolutions.map((res) => (
                <option key={res.value} value={res.value} className='text-amber-700'>
                  {res.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center space-x-4 mt-3">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-600">
              {connected ? 'Live price connected' : 'Price disconnected'}
            </span>
          </div>
          
          {loading && (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600 mr-2"></div>
              <span className="text-xs text-gray-600">Loading data...</span>
            </div>
          )}
          
          {chartData.length > 0 && (
            <div className="text-xs text-gray-600">
              {chartData.length} candles
            </div>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-4">
        {error ? (
          <div className="flex items-center justify-center h-60 bg-red-50 rounded-lg">
            <div className="text-center">
              <svg className="w-8 h-8 text-red-400 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-700 font-medium text-sm">Chart Error</p>
              <p className="text-red-600 text-xs mt-1">{error}</p>
            </div>
          </div>
        ) : (
          <div
            ref={chartContainerRef}
            className="w-full h-60 rounded-lg border border-gray-200"
          />
        )}
      </div>
      
      {/* Chart Info */}
      {chartData.length > 0 && !error && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-xs text-gray-600">
            <div>
              <span>Symbol:</span>
              <span className="ml-1 font-medium text-gray-900">BTCUSD</span>
            </div>
            <div>
              <span>24h High:</span>
              <span className="ml-1 font-medium text-gray-900">
                ${Math.max(...chartData.map(c => c.high)).toLocaleString()}
              </span>
            </div>
            <div>
              <span>24h Low:</span>
              <span className="ml-1 font-medium text-gray-900">
                ${Math.min(...chartData.map(c => c.low)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};