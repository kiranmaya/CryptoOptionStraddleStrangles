// Combined Chart Component for Straddle/Strangle Visualization

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
import { CalculationMethod, CombinedCandleData, combineOptionData } from '../utils/chartHelpers';
import { fetchCandlestickData } from '../utils/deltaApi';
import { useDeltaWebSocket } from '../utils/websocketClient';
import { Selection } from './OptionChainTable';

interface CandlestickUpdate {
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CombinedChartProps {
  selections: Selection[];
  calculationMethod: CalculationMethod;
  resolution: string;
  onCalculationChange: (method: CalculationMethod) => void;
}

export const CombinedChart: React.FC<CombinedChartProps> = ({
  selections,
  calculationMethod,
  resolution,
  onCalculationChange
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<CombinedCandleData[]>([]);
  const [currentCalculation, setCurrentCalculation] = useState<CalculationMethod>(calculationMethod);

  const { connected, subscribeCandlesticks, onMessage, offMessage } = useDeltaWebSocket();

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
    setCurrentCalculation(calculationMethod);
  }, [calculationMethod]);

  useEffect(() => {
    const container = chartContainerRef.current;

    if (!container) {
      return undefined;
    }

    const theme = resolveTheme();

    // Initialize chart
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 400,
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
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
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
      console.log(`[CombinedChart] Setting ${chartData.length} data points to chart`);
      
      const formattedData = chartData.slice(-200).map(candle => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

      console.log(`[CombinedChart] First candle:`, formattedData[0]);
      console.log(`[CombinedChart] Last candle:`, formattedData[formattedData.length - 1]);

      seriesRef.current.setData(formattedData);
      
      // Force chart to fit content
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }, 100);
    } else {
      console.log('[CombinedChart] No data to display');
      seriesRef.current.setData([]);
    }
  }, [chartData]);

  useEffect(() => {
    const loadChartData = async () => {
      if (selections.length === 0) {
        setChartData([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log(`[CombinedChart] Fetching data with resolution: "${resolution}"`);
        
        // Separate calls and puts
        const calls = selections.filter(s => s.type === 'call');
        const puts = selections.filter(s => s.type === 'put');

        if (calls.length === 0 || puts.length === 0) {
          setError('Select at least one call and one put option');
          setChartData([]);
          return;
        }

        // For now, use the first call and first put
        // In a full implementation, you might want to handle multiple selections
        const selectedCall = calls[0];
        const selectedPut = puts[0];

        console.log(`[CombinedChart] Fetching call: ${selectedCall.symbol}, put: ${selectedPut.symbol}`);

        // Fetch data for both options
        const [callData, putData] = await Promise.all([
          fetchCandlestickData(selectedCall.symbol, resolution),
          fetchCandlestickData(selectedPut.symbol, resolution)
        ]);

        if (callData.length === 0 || putData.length === 0) {
          setError('No candlestick data available for selected options');
          setChartData([]);
          return;
        }

        // Combine the data
        const combined = combineOptionData(callData, putData, currentCalculation);
        setChartData(combined);

        // Subscribe to real-time updates
        subscribeCandlesticks([selectedCall.symbol, selectedPut.symbol], resolution);

      } catch (err) {
        console.error('Error loading chart data:', err);
        setError(`Failed to load chart data: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    loadChartData();
  }, [selections, currentCalculation, resolution, subscribeCandlesticks]);

  // Handle real-time updates
  useEffect(() => {
    const handleCandlestickUpdate = (data: unknown) => {
      if (!seriesRef.current) return;

      const update = data as CandlestickUpdate;
      // Update the latest candle or add new one
      const candle = {
        time: update.time as UTCTimestamp,
        open: update.open,
        high: update.high,
        low: update.low,
        close: update.close,
      };

      // Simple update approach - always update with the new candle
      // In a more sophisticated implementation, you'd want to check if it's updating an existing candle
      seriesRef.current.update(candle);
    };

    if (connected) {
      onMessage('candlestick', handleCandlestickUpdate);

      return () => {
        offMessage('candlestick', handleCandlestickUpdate);
      };
    }
  }, [connected, onMessage, offMessage]);

  const handleCalculationMethodChange = (method: CalculationMethod) => {
    setCurrentCalculation(method);
    onCalculationChange(method);
  };

  const getChartTitle = () => {
    if (selections.length === 0) return 'Select options to view chart';
    
    const calls = selections.filter(s => s.type === 'call');
    const puts = selections.filter(s => s.type === 'put');
    
    if (calls.length === 0 && puts.length === 0) return 'Select options for straddle/strangle analysis';
    
    if (calls.length === 0) return `${puts.length} put(s) selected - need call option(s)`;
    if (puts.length === 0) return `${calls.length} call(s) selected - need put option(s)`;
    
    if (calls.length === 1 && puts.length === 1) {
      return `Straddle: ${calls[0].symbol} + ${puts[0].symbol}`;
    }
    
    return `Combined Options: ${calls.length} calls + ${puts.length} puts`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Chart Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Combined Options Chart</h2>
            <p className="text-sm text-gray-600 mt-1">{getChartTitle()}</p>
          </div>
          
          {/* Calculation Method Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Calculation:</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => handleCalculationMethodChange('average')}
                className={`
                  px-3 py-1 text-sm rounded-md transition-all duration-200
                  ${currentCalculation === 'average'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                  }
                `}
              >
                Average
              </button>
              <button
                onClick={() => handleCalculationMethodChange('sum')}
                className={`
                  px-3 py-1 text-sm rounded-md transition-all duration-200
                  ${currentCalculation === 'sum'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                  }
                `}
              >
                Sum
              </button>
            </div>
          </div>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center space-x-4 mt-3">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-600">
              {connected ? 'Live data connected' : 'Disconnected'}
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
              {chartData.length} candles • Resolution: {resolution}
            </div>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-4">
        {error ? (
          <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg">
            <div className="text-center">
              <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-700 font-medium">Chart Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          </div>
        ) : (
          <div
            ref={chartContainerRef}
            className="w-full h-96 rounded-lg border border-gray-200"
          />
        )}
      </div>
      
      {/* Chart Info */}
      {chartData.length > 0 && !error && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Method:</span>
              <span className="ml-1 font-medium capitalize">{currentCalculation}</span>
            </div>
            <div>
              <span className="text-gray-600">Data Points:</span>
              <span className="ml-1 font-medium">{chartData.length}</span>
            </div>
            <div>
              <span className="text-gray-600">Latest Price:</span>
              <span className="ml-1 font-medium">
                {chartData.length > 0 ? chartData[chartData.length - 1].close.toFixed(4) : '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Price Change:</span>
              <span className={`ml-1 font-medium ${
                chartData.length >= 2 
                  ? chartData[chartData.length - 1].close > chartData[chartData.length - 2].close 
                    ? 'text-green-600' 
                    : 'text-red-600'
                  : 'text-gray-600'
              }`}>
                {chartData.length >= 2 
                  ? `${((chartData[chartData.length - 1].close - chartData[chartData.length - 2].close) / chartData[chartData.length - 2].close * 100).toFixed(2)}%`
                  : '-'
                }
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};