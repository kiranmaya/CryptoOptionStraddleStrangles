// Combined Chart Component for Straddle/Strangle Visualization with BTC Price and Dual CCI

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineSeries,
  UTCTimestamp
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { CalculationMethod, chartDataCache, CombinedCandleData, combineOptionData } from '../utils/chartHelpers';
import { CandlestickData, fetchBTCPrice, fetchCandlestickData } from '../utils/deltaApi';
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

interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

interface CombinedChartProps {
  selections: Selection[];
  calculationMethod: CalculationMethod;
  onCalculationChange: (method: CalculationMethod) => void;
}

// Interactive tooltip interface
interface HoverData {
  time: number;
  dateTime: string;
  optionsData?: {
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePercent: number;
  };
  btcData?: {
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePercent: number;
  };
  optionsCci?: number;
  btcCci?: number;
}

interface TooltipState {
  isVisible: boolean;
  x: number;
  y: number;
  data: HoverData | null;
}

// CCI Data interface
interface CCIData {
  time: number;
  value: number;
}

// Helper function to calculate CCI (Commodity Channel Index)
const calculateCCI = (data: CombinedCandleData[] | CandlestickData[], period: number = 20): CCIData[] => {
  if (data.length < period + 1) return [];

  const cciData: CCIData[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    
    // Calculate Typical Price (TP) for each period
    const typicalPrices = slice.map(candle => (candle.high + candle.low + candle.close) / 3);
    
    // Calculate Simple Moving Average of Typical Price
    const sma = typicalPrices.reduce((sum, tp) => sum + tp, 0) / typicalPrices.length;
    
    // Calculate Mean Deviation
    const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / typicalPrices.length;
    
    // Calculate CCI
    const currentPrice = data[i];
    const currentTP = (currentPrice.high + currentPrice.low + currentPrice.close) / 3;
    let cci = (currentTP - sma) / (0.015 * meanDeviation);
    
    // Clamp extreme CCI values to prevent infinite/very large numbers
    // This helps keep the visual range reasonable while maintaining calculation accuracy
    if (!isFinite(cci) || Math.abs(cci) > 1000) {
      cci = Math.sign(cci) * 1000;
    }
    
    cciData.push({
      time: data[i].time,
      value: cci
    });
  }
  
  return cciData;
};

// Helper function to synchronize BTC data with options timeframe
const synchronizeDataWithOptions = async (
  btcData: CandlestickData[],
  optionsData: CombinedCandleData[]): Promise<CandlestickData[]> => {
  if (optionsData.length === 0) return btcData;
  
  // Get the time range from options data
  const optionsStartTime = Math.min(...optionsData.map(c => c.time));
  const optionsEndTime = Math.max(...optionsData.map(c => c.time));
  
  console.log(`Synchronization: Options timeframe ${new Date(optionsStartTime * 1000).toISOString()} to ${new Date(optionsEndTime * 1000).toISOString()}`);
  
  // Filter BTC data to match options timeframe
  const synchronizedBtcData = btcData.filter(candle =>
    candle.time >= optionsStartTime && candle.time <= optionsEndTime
  );
  
  // If no overlapping data, use the last N candles to match options count
  if (synchronizedBtcData.length === 0) {
    const targetLength = Math.min(optionsData.length, 100);
    const fallbackData = btcData.slice(-targetLength);
    console.log(`Synchronization: Using last ${targetLength} BTC candles as fallback`);
    return fallbackData;
  }
  
  // Ensure both datasets have the same length by trimming to the shorter one
  const minLength = Math.min(optionsData.length, synchronizedBtcData.length);
  if (minLength > 0) {
    const trimmedBtcData = synchronizedBtcData.slice(-minLength);
    console.log(`Synchronization: Final synchronized length: ${minLength} candles`);
    return trimmedBtcData;
  }
  
  return synchronizedBtcData;
};

export const CombinedCandleSticksChart: React.FC<CombinedChartProps> = ({
  selections,
  calculationMethod,
  onCalculationChange
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const optionsSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const btcSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const optionsCciSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const btcCciSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const optionsCciPriceLinesRef = useRef<unknown[]>([]);
  const btcCciPriceLinesRef = useRef<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [btcLoading, setBtcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<CombinedCandleData[]>([]);
  const [btcData, setBtcData] = useState<CandlestickData[]>([]);
  const [optionsCciData, setOptionsCciData] = useState<CCIData[]>([]);
  const [btcCciData, setBtcCciData] = useState<CCIData[]>([]);
  const [currentCalculation, setCurrentCalculation] = useState<CalculationMethod>(calculationMethod);
  const [resolution, setResolution] = useState('5');
  const [btcPrice, setBtcPrice] = useState<number>(0);
  const [btcPriceChange, setBtcPriceChange] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  
  // Interactive tooltip state
  const [tooltip, setTooltip] = useState<TooltipState>({
    isVisible: false,
    x: 0,
    y: 0,
    data: null
  });
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  const { connected, subscribeCandlesticks, subscribeMarkPrices, onMessage, offMessage } = useDeltaWebSocket();

  // Fullscreen handlers
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
  };

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'unset';
    };
  }, [isFullscreen]);

  const resolveTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      background: isDark ? '#1e293b' : '#ffffff',
      text: isDark ? '#e2e8f0' : '#0f172a',
      grid: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
      paneSeparator: isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.35)',
    };
  };

  // Price formatter function using Intl.NumberFormat
  const createPriceFormatter = () => {
    // Get the current user's primary locale
    const currentLocale = window.navigator.languages[0] || 'en-US';
    // Create a number format using Intl.NumberFormat
    return Intl.NumberFormat(currentLocale, {
      style: 'currency',
      currency: 'USD', // Currency for data points
    }).format;
  };

  // Helper function to get pane title for debugging
  const getPaneTitle = (index: number): string => {
    const titles = ['Combined Options', 'CCI1 (Combined)', 'BTC Price', 'CCI2 (BTC)'];
    return titles[index] || `Pane ${index}`;
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
   

    // Initialize chart with multiple panes support (4 panes in new order)
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 1000, // Use container height or fallback to 1000
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.text,
        attributionLogo: false,
        panes: {
          separatorColor: theme.paneSeparator,
          separatorHoverColor: theme.paneSeparator,
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        // Vertical crosshair line (showing Date in Label)
        vertLine: {
          color: '#C3BCDB44',
          labelBackgroundColor: '#9B7DFF',
        },
        // Horizontal crosshair line (showing Price in Label)
        horzLine: {
          color: '#9B7DFF',
          labelBackgroundColor: '#9B7DFF',
        },
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

    
    
    // Combined options candlestick series (will move to pane 0)
    const optionsSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    }, 0);

    // CCI for combined options (will move to pane 1)
    const optionsCciSeries = chart.addSeries(LineSeries, {
      color: '#8b5cf6',
      lineWidth: 2,
      title: 'CCI1 (Combined)',
    }, 1);

    // BTC candlestick series (will move to pane 2)
    const btcSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#3b82f6',
      downColor: '#ef4444',
      borderUpColor: '#3b82f6',
      borderDownColor: '#ef4444',
      wickUpColor: '#3b82f6',
      wickDownColor: '#ef4444',
    }, 2);

    // CCI for BTC (will move to pane 3)
    const btcCciSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      title: 'CCI2 (BTC)',
    }, 3);

   

    chartRef.current = chart;
    optionsSeriesRef.current = optionsSeries;
    optionsCciSeriesRef.current = optionsCciSeries;
    btcSeriesRef.current = btcSeries;
    btcCciSeriesRef.current = btcCciSeries;

    // Set up crosshair move handler for interactive tooltip
    chart.subscribeCrosshairMove((param) => {
      // Check if cursor is outside chart bounds
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y > container.clientHeight
      ) {
        setTooltip({
          isVisible: false,
          x: 0,
          y: 0,
          data: null
        });
        setHoveredTime(null);
        return;
      }

      const time = param.time as UTCTimestamp;
      const date = new Date(time * 1000);
      
      // Find data for all series at the hovered time
      const optionsCandle = chartData.find(c => c.time === time);
      const btcCandle = btcData.find(c => c.time === time);
      const optionsCciPoint = optionsCciData.find(c => c.time === time);
      const btcCciPoint = btcCciData.find(c => c.time === time);
      
      // Prepare hover data
      const hoverData: HoverData = {
        time: time,
        dateTime: date.toLocaleString(),
      };
      
      // Add options data if available
      if (optionsCandle) {
        const prevCandle = chartData.find(c => c.time === time - (parseInt(resolution) * 60));
        const change = prevCandle ? optionsCandle.close - prevCandle.close : 0;
        const changePercent = prevCandle ? (change / prevCandle.close) * 100 : 0;
        
        hoverData.optionsData = {
          open: optionsCandle.open,
          high: optionsCandle.high,
          low: optionsCandle.low,
          close: optionsCandle.close,
          change: change,
          changePercent: changePercent
        };
      }
      
      // Add BTC data if available
      if (btcCandle) {
        const prevBtc = btcData.find(c => c.time === time - (parseInt(resolution) * 60));
        const change = prevBtc ? btcCandle.close - prevBtc.close : 0;
        const changePercent = prevBtc ? (change / prevBtc.close) * 100 : 0;
        
        hoverData.btcData = {
          open: btcCandle.open,
          high: btcCandle.high,
          low: btcCandle.low,
          close: btcCandle.close,
          change: change,
          changePercent: changePercent
        };
      }
      
      // Add CCI data if available
      if (optionsCciPoint) {
        hoverData.optionsCci = optionsCciPoint.value;
      }
      
      if (btcCciPoint) {
        hoverData.btcCci = btcCciPoint.value;
      }
      
      // Show tooltip if we have any data
      const hasData = Boolean(optionsCandle || btcCandle || optionsCciPoint || btcCciPoint);
      
      setTooltip({
        isVisible: hasData,
        x: param.point.x,
        y: param.point.y,
        data: hasData ? hoverData : null
      });
      
      setHoveredTime(hasData ? time : null);
    });

    // Set pane heights for 4 panes using stretch factors (following lightweight-charts example)
    const initializePanes = () => {
      const panes = chart.panes();
      console.log(`[CombinedChart] Found ${panes.length} panes`);
      
      if (panes.length >= 4) {
        // Use stretch factors to set proportional heights
        // Each factor is treated as percentage when summed (total = 100)
        // Equal distribution: 25% each for 4 panes
        panes[0].setStretchFactor(25); // Combined Options
        panes[1].setStretchFactor(25); // CCI1 (Combined)
        panes[2].setStretchFactor(25); // BTC Price
        panes[3].setStretchFactor(25); // CCI2 (BTC)
        
        console.log(`[CombinedChart] Set stretch factors: Pane 0 (25%), Pane 1 (25%), Pane 2 (25%), Pane 3 (25%)`);
        
        // Fit content and auto-scale price scales
        chart.timeScale().fitContent();
        
        // Auto-scale all price scales
        panes.forEach((pane, index) => {
          console.log(`[CombinedChart] Auto-scaling pane ${index} (${getPaneTitle(index)})`);
          pane.priceScale('right').applyOptions({ autoScale: true });
        });
        
        // Create fixed CCI reference lines (+100 and -100) for both CCI panes
        // These are created only once and remain fixed throughout chart lifetime
        if (optionsCciSeriesRef.current && !optionsCciPriceLinesRef.current.length) {
          const plus100Line = optionsCciSeriesRef.current.createPriceLine({
            price: 100,
            color: '#ef4444',
            lineWidth: 3,
            lineStyle: 3, // Dashed line
            axisLabelVisible: true,
            title: 'CCI1 +100',
          });
          
          const minus100Line = optionsCciSeriesRef.current.createPriceLine({
            price: -100,
            color: '#10b981',
            lineWidth: 3,
            lineStyle: 3, // Dashed line
            axisLabelVisible: true,
            title: 'CCI1 -100',
          });
          
          optionsCciPriceLinesRef.current = [plus100Line, minus100Line];
          console.log('[CombinedChart] CCI1 reference lines created permanently');
        }
        
        if (btcCciSeriesRef.current && !btcCciPriceLinesRef.current.length) {
          const plus100Line1 = btcCciSeriesRef.current.createPriceLine({
            price: 100,
            color: '#ef4444',
            lineWidth: 3,
            lineStyle: 3, // Dashed line
            axisLabelVisible: true,
            title: 'CCI2 +100',
          });
          
          const minus100Line1 = btcCciSeriesRef.current.createPriceLine({
            price: -100,
            color: '#10b981',
            lineWidth: 3,
            lineStyle: 3, // Dashed line
            axisLabelVisible: true,
            title: 'CCI2 -100',
          });
          
          btcCciPriceLinesRef.current = [plus100Line1, minus100Line1];
          console.log('[CombinedChart] CCI2 reference lines created permanently');
        }
        
        return true;
      } else {
        console.log(`[CombinedChart] Only ${panes.length} panes found, retrying...`);
        return false;
      }
    };

    // Try immediate initialization first
    if (!initializePanes()) {
      // Retry with longer timeout for proper chart initialization
      setTimeout(() => {
        if (initializePanes()) {
          console.log('[CombinedChart] Panes initialized successfully on retry');
        } else {
          console.log('[CombinedChart] Failed to initialize panes after retry');
        }
      }, 300);
    } else {
      console.log('[CombinedChart] Panes initialized immediately');
    }

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === container) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            console.log(`[CombinedChart] Resizing chart to ${width}x${height}`);
            chart.applyOptions({
              width: Math.floor(width),
              height: Math.floor(height),
            });
            
            // Re-initialize panes after resize to maintain equal heights using stretch factors
            setTimeout(() => {
              const panes = chart.panes();
              if (panes.length >= 4) {
                // Reset stretch factors to maintain proportional layout
                panes[0].setStretchFactor(25); // Combined Options
                panes[1].setStretchFactor(25); // CCI1 (Combined)
                panes[2].setStretchFactor(25); // BTC Price
                panes[3].setStretchFactor(25); // CCI2 (BTC)
                
                console.log(`[CombinedChart] Resize - Reset stretch factors to maintain equal proportions`);
                
                chart.timeScale().fitContent();
                panes.forEach((pane, index) => {
                  console.log(`[CombinedChart] Resize auto-scale pane ${index} (${getPaneTitle(index)})`);
                  pane.priceScale('right').applyOptions({ autoScale: true });
                });
              }
            }, 100);
          }
        }
      });
    });

    resizeObserver.observe(container);

    // Handle fullscreen resize specifically
    const handleFullscreenResize = () => {
      if (chartRef.current && container) {
        const rect = container.getBoundingClientRect();
        console.log(`[CombinedChart] Fullscreen resize detected: ${rect.width}x${rect.height}`);
        
        chartRef.current.applyOptions({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
        
        // Re-apply stretch factors after fullscreen resize
        setTimeout(() => {
          const panes = chartRef.current!.panes();
          if (panes.length >= 4) {
            panes[0].setStretchFactor(25);
            panes[1].setStretchFactor(25);
            panes[2].setStretchFactor(25);
            panes[3].setStretchFactor(25);
            
            chartRef.current!.timeScale().fitContent();
            panes.forEach((pane, index) => {
              pane.priceScale('right').applyOptions({ autoScale: true });
            });
          }
        }, 150);
      }
    };

    // Listen for fullscreen changes
    const handleFullscreenChange = () => {
      if (isFullscreen) {
        // Small delay to allow DOM to settle
        setTimeout(handleFullscreenResize, 100);
      } else {
        // Exit fullscreen
        setTimeout(handleFullscreenResize, 100);
      }
    };

    // Add fullscreen change listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Handle theme changes
    const themeObserver = new MutationObserver(() => {
      const nextTheme = resolveTheme();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: nextTheme.background },
          textColor: nextTheme.text,
          panes: {
            separatorColor: nextTheme.paneSeparator,
            separatorHoverColor: nextTheme.paneSeparator,
          },
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
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const setOptionsData = async () => {
      if (!optionsSeriesRef.current || !chartRef.current) return;

      // Wait for panes to be properly initialized
      const panes = chartRef.current.panes();
      if (panes.length < 4) {
        console.log('[CombinedChart] Waiting for panes to initialize...');
        setTimeout(() => setOptionsData(), 200);
        return;
      }

      if (chartData.length > 0) {
        console.log(`[CombinedChart] Setting ${chartData.length} data points to chart`);
        
        // Ensure data is properly sorted by time before setting to chart
        const sortedFormattedData = chartData
          .map(candle => ({
            time: candle.time as UTCTimestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }))
          .sort((a, b) => a.time - b.time);

        // Validate data order and remove any potential duplicates
        const validatedData = sortedFormattedData.filter((candle, index, arr) => {
          if (index > 0 && candle.time <= arr[index - 1].time) {
            console.warn(`[CombinedChart] Data ordering issue detected at index ${index}, time: ${candle.time}, prev: ${arr[index - 1].time}`);
            return false;
          }
          return true;
        });

        console.log(`[CombinedChart] First candle:`, validatedData[0]);
        console.log(`[CombinedChart] Last candle:`, validatedData[validatedData.length - 1]);
        console.log(`[CombinedChart] Data validation: ${validatedData.length}/${sortedFormattedData.length} candles passed validation`);

        optionsSeriesRef.current.setData(validatedData);
        // Calculate and set CCI1 data for combined options
        if (optionsCciSeriesRef.current) {
          const calculatedCCIi = calculateCCI(chartData);
          setOptionsCciData(calculatedCCIi);
          
          // Deduplicate CCI data by time, keeping the last occurrence
          const cciFormattedData = calculatedCCIi
            .map(cci => ({
              time: cci.time as UTCTimestamp,
              value: cci.value,
            }))
            .sort((a, b) => a.time - b.time)
            .filter((cci, index, arr) => {
              // Remove duplicates by keeping only the last occurrence of each time
              if (index > 0 && cci.time === arr[index - 1].time) {
                console.warn(`[CombinedChart] Removing duplicate CCI1 data point at index ${index}, time: ${cci.time}`);
                return false;
              }
              return true;
            });
          
          optionsCciSeriesRef.current.setData(cciFormattedData);
          
          // CCI reference lines (+100 and -100) are already created permanently in initialization
          // No need to recreate them here - they remain fixed throughout chart lifetime
          console.log(`[CombinedChart] Set ${cciFormattedData.length} CCI1 data points (${calculatedCCIi.length} - duplicates removed)`);
        }
        
        // Force chart to fit content and auto-scale price scales
        setTimeout(() => {
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
            // Auto-scale all price scales to fit the data
            const panes = chartRef.current.panes();
            panes.forEach(pane => {
              pane.priceScale('right').applyOptions({ autoScale: true });
            });
          }
        }, 100);
      } else {
        console.log('[CombinedChart] No data to display');
        optionsSeriesRef.current.setData([]);
        if (optionsCciSeriesRef.current) {
          optionsCciSeriesRef.current.setData([]);
        }
      }
    };

    setOptionsData();
  }, [chartData]);

  useEffect(() => {
    if (!btcSeriesRef.current) return;

    if (btcData.length > 0) {
      // Ensure BTC data is properly sorted by time before setting to chart
      const sortedFormattedBtcData = btcData
        .map(candle => ({
          time: candle.time as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }))
        .sort((a, b) => a.time - b.time);

      // Validate BTC data order and remove any potential duplicates
      const validatedBtcData = sortedFormattedBtcData.filter((candle, index, arr) => {
        if (index > 0 && candle.time <= arr[index - 1].time) {
          console.warn(`[CombinedChart] BTC data ordering issue detected at index ${index}, time: ${candle.time}, prev: ${arr[index - 1].time}`);
          return false;
        }
        return true;
      });

      console.log(`[CombinedChart] BTC data validation: ${validatedBtcData.length}/${sortedFormattedBtcData.length} candles passed validation`);
      btcSeriesRef.current.setData(validatedBtcData);
      
      // Calculate CCI2 for BTC
      if (btcCciSeriesRef.current) {
        const calculatedBtcCCI = calculateCCI(btcData);
        setBtcCciData(calculatedBtcCCI);
        
        // Deduplicate BTC CCI data by time, keeping the last occurrence
        const btcCciFormattedData = calculatedBtcCCI
          .map(cci => ({
            time: cci.time as UTCTimestamp,
            value: cci.value,
          }))
          .sort((a, b) => a.time - b.time)
          .filter((cci, index, arr) => {
            // Remove duplicates by keeping only the last occurrence of each time
            if (index > 0 && cci.time === arr[index - 1].time) {
              console.warn(`[CombinedChart] Removing duplicate BTC CCI data point at index ${index}, time: ${cci.time}`);
              return false;
            }
            return true;
          });
        
        btcCciSeriesRef.current.setData(btcCciFormattedData);
        console.log(`[CombinedChart] Set ${btcCciFormattedData.length} CCI2 (BTC) data points (${calculatedBtcCCI.length} - duplicates removed)`);
        
        // CCI reference lines (+100 and -100) are already created permanently in initialization
        // No need to recreate them here - they remain fixed throughout chart lifetime
      }
      
      // Auto-scale price scales when BTC data is loaded
      setTimeout(() => {
        if (chartRef.current) {
          const panes = chartRef.current.panes();
          panes.forEach(pane => {
            pane.priceScale('right').applyOptions({ autoScale: true });
          });
        }
      }, 100);
    } else {
      btcSeriesRef.current.setData([]);
      if (btcCciSeriesRef.current) {
        btcCciSeriesRef.current.setData([]);
      }
    }
  }, [btcData]);

  useEffect(() => {
    const loadChartData = async () => {
      setLoading(true);
      setBtcLoading(true);
      setError(null);

      try {
        console.log(`[CombinedChart] Fetching data with resolution: "${resolution}"`);
        
        // If no selections, clear data
        if (selections.length === 0) {
          setChartData([]);
          setBtcData([]);
          setOptionsCciData([]);
          setBtcCciData([]);
          return;
        }

        // Separate calls and puts
        const calls = selections.filter(s => s.type === 'call');
        const puts = selections.filter(s => s.type === 'put');

        console.log(`[CombinedChart] ${calls.length} calls, ${puts.length} puts selected`);

        // Fetch all option data in parallel for better performance
        const allOptionSymbols = [...calls.map(c => c.symbol), ...puts.map(p => p.symbol)];
        const allOptionData: CandlestickData[][] = [];
        
        if (allOptionSymbols.length > 0) {
          // Use cache for better performance
          const cache = chartDataCache;
          
          const dataPromises = allOptionSymbols.map(async (symbol) => {
            const cacheKey = `${symbol}_${resolution}`;
            const cachedData = cache.get(cacheKey);
            
            if (cachedData) {
              console.log(`[CombinedChart] Using cached data for ${symbol}`);
              return cachedData;
            }
            
            const data = await fetchCandlestickData(symbol, resolution);
            cache.set(cacheKey, data);
            return data;
          });
          
          const fetchedData = await Promise.all(dataPromises);
          allOptionData.push(...fetchedData);
        }
        
        // Separate call and put data
        const callData = allOptionData.slice(0, calls.length);
        const putData = allOptionData.slice(calls.length);

        console.log(`[CombinedChart] Call data lengths:`, callData.map(d => d.length));
        console.log(`[CombinedChart] Put data lengths:`, putData.map(d => d.length));

        // Combine data using the improved helper function
        let combinedOptionsData: CombinedCandleData[] = [];
        
        if (callData.length > 0 || putData.length > 0) {
          // Use the improved combination logic
          combinedOptionsData = combineOptionData(
            callData.flat(), 
            putData.flat(), 
            currentCalculation
          );
          
          console.log(`[CombinedChart] Combined options data length: ${combinedOptionsData.length}`);
          
          if (combinedOptionsData.length === 0) {
            setError('No valid candlestick data available for selected options');
            setChartData([]);
          } else {
            setChartData(combinedOptionsData);
          }
          
          // Subscribe to real-time updates for all options
          subscribeCandlesticks(allOptionSymbols, resolution);
        }

        // Fetch BTC data in parallel
        console.log(`[CombinedChart] Fetching BTC data with resolution: "${resolution}"`);
        const btcCandlestickData = await fetchCandlestickData('BTCUSD', resolution);
        
        if (btcCandlestickData.length === 0) {
          console.warn('[CombinedChart] No BTC price data available');
          setBtcData([]);
        } else {
          // Synchronize BTC data with options timeframe using improved logic
          let synchronizedBtcData = btcCandlestickData;
          
          if (combinedOptionsData.length > 0) {
            synchronizedBtcData = await synchronizeDataWithOptions(
              btcCandlestickData,
              combinedOptionsData,
            );
          }
          
          console.log(`[CombinedChart] Synchronized BTC data length: ${synchronizedBtcData.length}`);
          setBtcData(synchronizedBtcData);
          
          // Calculate BTC metrics
          if (synchronizedBtcData.length > 0) {
            // Calculate BTC price change
            if (synchronizedBtcData.length >= 2) {
              const latest = synchronizedBtcData[synchronizedBtcData.length - 1].close;
              const previous = synchronizedBtcData[synchronizedBtcData.length - 2].close;
              const change = ((latest - previous) / previous) * 100;
              setBtcPriceChange(change);
            }

            // Get current BTC price
            try {
              const currentBtcPrice = await fetchBTCPrice();
              setBtcPrice(currentBtcPrice);
            } catch (err) {
              console.warn('[CombinedChart] Failed to fetch current BTC price:', err);
              // Use last close price as fallback
              if (synchronizedBtcData.length > 0) {
                setBtcPrice(synchronizedBtcData[synchronizedBtcData.length - 1].close);
              }
            }

            // Subscribe to real-time updates for BTC
            subscribeMarkPrices(['BTCUSD']);
          }
        }

        // Reset and scale chart after all data is loaded
        setTimeout(() => {
          resetAndScaleChart();
        }, 200);

      } catch (err) {
        console.error('Error loading chart data:', err);
        setError(`Failed to load chart data: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setChartData([]);
        setBtcData([]);
        setOptionsCciData([]);
        setBtcCciData([]);
      } finally {
        setLoading(false);
        setBtcLoading(false);
      }
    };

    loadChartData();
  }, [selections, currentCalculation, resolution, subscribeCandlesticks, subscribeMarkPrices]);

  // Handle real-time updates for options
  useEffect(() => {
    const handleCandlestickUpdate = (data: unknown) => {
      if (!optionsSeriesRef.current) return;

      const update = data as CandlestickUpdate;
      // Update the latest candle or add new one
      const candle = {
        time: update.time as UTCTimestamp,
        open: update.open,
        high: update.high,
        low: update.low,
        close: update.close,
      };

      optionsSeriesRef.current.update(candle);
    };

    if (connected) {
      onMessage('candlestick', handleCandlestickUpdate);

      return () => {
        offMessage('candlestick', handleCandlestickUpdate);
      };
    }
  }, [connected, onMessage, offMessage]);

  // Handle real-time price updates for BTC
  useEffect(() => {
    const handlePriceUpdate = (update: PriceUpdate) => {
      if (!update || !update.symbol || update.symbol !== 'BTCUSD') return;

      setBtcPrice(update.price);
      
      // Calculate change from last known price
      if (btcData.length > 0) {
        const lastPrice = btcData[btcData.length - 1].close;
        const change = ((update.price - lastPrice) / lastPrice) * 100;
        setBtcPriceChange(change);
      }
    };

    if (connected) {
      onMessage('price', (data: unknown) => {
        const priceUpdate = data as PriceUpdate;
        handlePriceUpdate(priceUpdate);
      });

      return () => {
        offMessage('price', (data: unknown) => {
          const priceUpdate = data as PriceUpdate;
          handlePriceUpdate(priceUpdate);
        });
      };
    }
  }, [connected, onMessage, offMessage, btcData]);

  const handleCalculationMethodChange = (method: CalculationMethod) => {
    setCurrentCalculation(method);
    onCalculationChange(method);
  };

  const resetAndScaleChart = () => {
    if (chartRef.current) {
      console.log('[CombinedChart] Resetting and scaling chart');
      chartRef.current.timeScale().fitContent();
      
      // Auto-scale all price scales
      const panes = chartRef.current.panes();
      panes.forEach(pane => {
        pane.priceScale('right').applyOptions({ autoScale: true });
      });
    }
  };

  const getChartTitle = () => {
    if (selections.length === 0) return 'Select options to view chart';
    
    const calls = selections.filter(s => s.type === 'call');
    const puts = selections.filter(s => s.type === 'put');
    
    if (calls.length === 0 && puts.length === 0) return 'Select options for analysis';
    
    // Handle single option type selections
    if (calls.length > 0 && puts.length === 0) {
      if (calls.length === 1) {
        return `Call Option: ${calls[0].symbol}`;
      }
      return `Combined Calls: ${calls.length} call options`;
    }
    
    if (calls.length === 0 && puts.length > 0) {
      if (puts.length === 1) {
        return `Put Option: ${puts[0].symbol}`;
      }
      return `Combined Puts: ${puts.length} put options`;
    }
    
    // Both calls and puts selected
    if (calls.length === 1 && puts.length === 1) {
      return `Straddle: ${calls[0].symbol} + ${puts[0].symbol}`;
    }
    
    return `Straddle/Strangle: ${calls.length} calls + ${puts.length} puts`;
  };

  const getBtcPriceChangeColor = () => {
    if (btcPriceChange > 0) return 'text-green-600';
    if (btcPriceChange < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getBtcPriceChangeIcon = () => {
    if (btcPriceChange > 0) {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 6.414 6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      );
    } else if (btcPriceChange < 0) {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 13.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    }
    return null;
  };

  return (
    <div className={`
      ${isFullscreen
        ? 'fixed inset-0 z-50 bg-white flex flex-col'
        : 'bg-white rounded-lg shadow-sm border'
      }
    `}>
      {/* Chart Header */}
      <div className={`${isFullscreen ? 'p-6 border-b border-gray-200' : 'p-4 border-b border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`${isFullscreen ? 'text-xl font-semibold' : 'text-lg font-semibold'} text-gray-900`}>
              Combined Options + BTC Chart with Dual CCI
            </h2>
            <div className="flex items-center space-x-4 mt-1">
              <p className="text-sm text-gray-600">{getChartTitle()}</p>
              {btcPrice > 0 && (
                <div className="flex items-center space-x-2">
                  <span className={`${isFullscreen ? 'text-xl' : 'text-lg'} font-bold text-gray-900`}>
                    ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {Math.abs(btcPriceChange) > 0.01 && (
                    <span className={`text-sm font-medium flex items-center ${getBtcPriceChangeColor()}`}>
                      {getBtcPriceChangeIcon()}
                      {btcPriceChange.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center space-x-4">
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
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center space-x-4 mt-3">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-600">
              {connected ? 'Live data connected' : 'Disconnected'}
            </span>
          </div>
          
          {(loading || btcLoading) && (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600 mr-2"></div>
              <span className="text-xs text-gray-600">Loading data...</span>
            </div>
          )}
          
          {chartData.length > 0 && (
            <div className="text-xs text-gray-600">
              {chartData.length} options candles • Resolution: {resolution}
            </div>
          )}
          
          {btcData.length > 0 && (
            <div className="text-xs text-gray-600">
              {btcData.length} BTC candles
            </div>
          )}
          
          {optionsCciData.length > 0 && (
            <div className="text-xs text-gray-600">
              {optionsCciData.length} CCI1 points
            </div>
          )}
          
          {btcCciData.length > 0 && (
            <div className="text-xs text-gray-600">
              {btcCciData.length} CCI2 points
            </div>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className={isFullscreen ? 'flex-1 overflow-hidden' : 'p-4'}>
        {error ? (
          <div className={`${isFullscreen ? 'h-full' : 'h-96'} flex items-center justify-center bg-red-50 rounded-lg`}>
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
            ref={(el) => {
              chartContainerRef.current = el;
              setContainerElement(el);
            }}
            className={`
              relative w-full rounded-lg border border-gray-200
              ${isFullscreen ? 'h-full min-h-0' : 'h-[1000px]'}
            `}
            style={isFullscreen ? {
              height: 'calc(100vh - 120px)', // Account for header height in fullscreen
              minHeight: '400px'
            } : {}}
          >
            {/* Floating Controls Inside Chart */}
            <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="flex items-center space-x-2 px-3 py-1 text-sm text-white bg-black bg-opacity-50 hover:bg-opacity-70 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 9V3h2v6h6v2h-6v6H9v-6H3V9h6z" clipRule="evenodd" />
                    </svg>
                    <span>Exit</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    <span>Fullscreen</span>
                  </>
                )}
              </button>

              {/* Resolution Selector */}
              <div className="flex items-center space-x-2 px-3 py-1 text-sm text-white bg-black bg-opacity-50 rounded-lg">
                <span className="text-white">Resolution:</span>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="text-sm text-gray-900 bg-white bg-opacity-90 rounded px-2 py-1 hover:bg-opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1" >1m</option>
                  <option value="3">3m</option>
                  <option value="5">5m</option>
                  <option value="15">15m</option>
                  <option value="30">30m</option>
                </select>
              </div>
            </div>
            
            {/* Tracking Tooltip - Follows user's cursor */}
            {tooltip.isVisible && tooltip.data && containerElement && (() => {
              const tooltipWidth = 280;
              const tooltipHeight = 200;
              const tooltipMargin = 15;
              
              // Calculate position following the user's cursor (like in the examples)
              let left = tooltip.x + tooltipMargin;
              if (left > containerElement.clientWidth - tooltipWidth) {
                left = tooltip.x - tooltipMargin - tooltipWidth;
              }
              
              let top = tooltip.y + tooltipMargin;
              if (top > containerElement.clientHeight - tooltipHeight) {
                top = tooltip.y - tooltipHeight - tooltipMargin;
              }
              
              // Ensure tooltip stays within container bounds
              left = Math.max(0, Math.min(containerElement.clientWidth - tooltipWidth, left));
              top = Math.max(0, Math.min(containerElement.clientHeight - tooltipHeight, top));
              
              return (
                <div
                  className="absolute bg-white border border-gray-300 rounded-lg shadow-xl text-xs pointer-events-none z-20 max-w-sm font-mono"
                  style={{
                    left: left + 'px',
                    top: top + 'px',
                    width: tooltipWidth + 'px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {/* Header with date/time */}
                  <div className="bg-gray-50 text-gray-900 font-semibold px-3 py-2 rounded-t-lg border-b border-gray-200">
                    {tooltip.data.dateTime}
                  </div>
                  
                  <div className="p-3 space-y-3">
                    {/* Options Data */}
                    {tooltip.data.optionsData && (
                      <div className="border-b border-gray-100 pb-2">
                        <div className="text-green-600 font-semibold text-xs mb-1 flex items-center">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                          Combined Options
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-xs">
                          <div className="text-gray-600">O:</div>
                          <div className="text-gray-900 font-mono">{tooltip.data.optionsData.open.toFixed(4)}</div>
                          <div className="text-gray-600">H:</div>
                          <div className="text-gray-900 font-mono">{tooltip.data.optionsData.high.toFixed(4)}</div>
                          <div className="text-gray-600">L:</div>
                          <div className="text-gray-900 font-mono">{tooltip.data.optionsData.low.toFixed(4)}</div>
                          <div className="text-gray-600">C:</div>
                          <div className={`font-mono font-semibold ${
                            tooltip.data.optionsData.change >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {tooltip.data.optionsData.close.toFixed(4)}
                          </div>
                        </div>
                        {tooltip.data.optionsData.changePercent !== 0 && (
                          <div className={`text-xs mt-1 flex items-center ${
                            tooltip.data.optionsData.change >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {tooltip.data.optionsData.change >= 0 ? '↗' : '↘'}
                            <span className="ml-1 font-mono">
                              {tooltip.data.optionsData.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* BTC Data */}
                    {tooltip.data.btcData && (
                      <div className="border-b border-gray-100 pb-2">
                        <div className="text-yellow-600 font-semibold text-xs mb-1 flex items-center">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                          BTC Price
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-xs">
                          <div className="text-gray-600">O:</div>
                          <div className="text-gray-900 font-mono">${tooltip.data.btcData.open.toLocaleString()}</div>
                          <div className="text-gray-600">H:</div>
                          <div className="text-gray-900 font-mono">${tooltip.data.btcData.high.toLocaleString()}</div>
                          <div className="text-gray-600">L:</div>
                          <div className="text-gray-900 font-mono">${tooltip.data.btcData.low.toLocaleString()}</div>
                          <div className="text-gray-600">C:</div>
                          <div className={`font-mono font-semibold ${
                            tooltip.data.btcData.change >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${tooltip.data.btcData.close.toLocaleString()}
                          </div>
                        </div>
                        {tooltip.data.btcData.changePercent !== 0 && (
                          <div className={`text-xs mt-1 flex items-center ${
                            tooltip.data.btcData.change >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {tooltip.data.btcData.change >= 0 ? '↗' : '↘'}
                            <span className="ml-1 font-mono">
                              {tooltip.data.btcData.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* CCI Data */}
                    <div className="grid grid-cols-2 gap-3">
                      {tooltip.data.optionsCci !== undefined && (
                        <div>
                          <div className="text-purple-600 font-semibold text-xs mb-1 flex items-center">
                            <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                            CCI1
                          </div>
                          <div className={`font-mono text-sm ${
                            tooltip.data.optionsCci > 100
                              ? 'text-red-600 font-bold'
                              : tooltip.data.optionsCci < -100
                                ? 'text-green-600 font-bold'
                                : 'text-gray-700'
                          }`}>
                            {tooltip.data.optionsCci.toFixed(2)}
                          </div>
                        </div>
                      )}
                      {tooltip.data.btcCci !== undefined && (
                        <div>
                          <div className="text-orange-600 font-semibold text-xs mb-1 flex items-center">
                            <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
                            CCI2
                          </div>
                          <div className={`font-mono text-sm ${
                            tooltip.data.btcCci > 100
                              ? 'text-red-600 font-bold'
                              : tooltip.data.btcCci < -100
                                ? 'text-green-600 font-bold'
                                : 'text-gray-700'
                          }`}>
                            {tooltip.data.btcCci.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Floating Tooltip - Positioned next to data point (like in lightweight-charts examples) */}
            {tooltip.isVisible && tooltip.data && containerElement && (() => {
              const floatingTooltipWidth = 200;
              const floatingTooltipHeight = 120;
              const floatingTooltipMargin = 20;
              
              // Position tooltip next to the data point (following floating tooltip example)
              let left = tooltip.x - 50; // Shift left from cursor
              left = Math.max(0, Math.min(containerElement.clientWidth - floatingTooltipWidth, left));
              
              // Position tooltip above/below the cursor based on available space
              let top = tooltip.y - floatingTooltipHeight - floatingTooltipMargin;
              if (top < 0) {
                top = Math.min(containerElement.clientHeight - floatingTooltipHeight, tooltip.y + floatingTooltipMargin);
              }
              
              return (
                <div
                  className="absolute bg-black bg-opacity-80 text-white p-2 rounded text-xs pointer-events-none z-20 font-mono"
                  style={{
                    left: left + 'px',
                    top: top + 'px',
                    width: floatingTooltipWidth + 'px',
                    minHeight: floatingTooltipHeight + 'px',
                  }}
                >
                  <div className="text-white font-semibold text-xs mb-1">
                    {tooltip.data.dateTime.split(',')[0]} {/* Just the date part */}
                  </div>
                  
                  <div className="space-y-1">
                    {tooltip.data.optionsData && (
                      <div className="text-green-300">
                        <div className="text-xs">Options: {tooltip.data.optionsData.close.toFixed(4)}</div>
                        <div className={`text-xs ${tooltip.data.optionsData.change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                          {tooltip.data.optionsData.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    )}
                    
                    {tooltip.data.btcData && (
                      <div className="text-yellow-300">
                        <div className="text-xs">BTC: ${tooltip.data.btcData.close.toLocaleString()}</div>
                        <div className={`text-xs ${tooltip.data.btcData.change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                          {tooltip.data.btcData.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    )}
                    
                    <div className="text-gray-300 text-xs">
                      {connected ? '🟢 Live' : '⚪ Historical'}
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Live Data Summary Panel */}
            {hoveredTime && tooltip.data && (
              <div className="absolute top-4 right-4 bg-white bg-opacity-95 backdrop-blur-sm rounded-lg p-3 shadow-lg border z-10">
                <div className="text-xs space-y-1">
                  <div className="font-medium text-gray-900">
                    Live Data Summary
                  </div>
                  {tooltip.data.optionsData && (
                    <div className="text-blue-600">
                      Options: {tooltip.data.optionsData.close.toFixed(4)}
                      <span className={`ml-1 ${tooltip.data.optionsData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({tooltip.data.optionsData.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                  {tooltip.data.btcData && (
                    <div className="text-yellow-600">
                      BTC: ${tooltip.data.btcData.close.toLocaleString()}
                      <span className={`ml-1 ${tooltip.data.btcData.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({tooltip.data.btcData.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                  <div className="text-gray-600 text-xs">
                    {connected ? 'Live data' : 'Historical data'}
                  </div>
                </div>
              </div>
            )}
            
            {/* Interactive Instructions */}
            <div className="absolute bottom-4 left-4 bg-white bg-opacity-80 backdrop-blur-sm rounded p-2 text-xs text-gray-600 z-10">
              <div>🖱️ Hover: View all series data</div>
              <div>📊 Crosshair: Real-time values</div>
              <div>📈 4 panes: Options | CCI1 | BTC | CCI2</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Chart Info - Hidden in fullscreen for more chart space */}
      {!isFullscreen && chartData.length > 0 && !error && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Method:</span>
              <span className="ml-1 font-medium  text-gray-900 capitalize">{currentCalculation}</span>
            </div>
            <div>
              <span className="text-gray-600">Options Data Points:</span>
              <span className="ml-1  text-gray-900 font-medium">{chartData.length}</span>
            </div>
            <div>
              <span className="text-gray-600">Latest Options Price:</span>
              <span className="ml-1  text-gray-900 font-medium">
                {chartData.length > 0 ? chartData[chartData.length - 1].close.toFixed(4) : '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Options Price Change:</span>
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
          
          {/* BTC Info */}
          {btcData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-gray-200">
              <div>
                <span className="text-gray-600">BTC Symbol:</span>
                <span className="ml-1 font-medium text-gray-900">BTCUSD</span>
              </div>
              <div>
                <span className="text-gray-600">BTC Data Points:</span>
                <span className="ml-1 font-medium  text-gray-900">{btcData.length}</span>
              </div>
              <div>
                <span className="text-gray-600">BTC Current Price:</span>
                <span className="ml-1 font-medium  text-gray-900">
                  ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-gray-600">BTC Price Change:</span>
                <span className={`ml-1 font-medium ${getBtcPriceChangeColor()}`}>
                  {Math.abs(btcPriceChange) > 0.01 ? `${btcPriceChange.toFixed(2)}%` : '-'}
                </span>
              </div>
            </div>
          )}
          
          {/* CCI1 Info - Combined Options */}
          {optionsCciData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-gray-200">
              <div>
                <span className="text-gray-600">CCI1 Indicator:</span>
                <span className="ml-1 font-medium text-gray-900">CCI (Combined Options)</span>
              </div>
              <div>
                <span className="text-gray-600">CCI1 Data Points:</span>
                <span className="ml-1 font-medium text-gray-900">{optionsCciData.length}</span>
              </div>
              <div>
                <span className="text-gray-600">Latest CCI1:</span>
                <span className={`ml-1 font-medium ${
                  optionsCciData.length > 0
                    ? optionsCciData[optionsCciData.length - 1].value > 100
                      ? 'text-red-600'
                      : optionsCciData[optionsCciData.length - 1].value < -100
                        ? 'text-green-600'
                        : 'text-gray-600'
                    : 'text-gray-600'
                }`}>
                  {optionsCciData.length > 0 ? optionsCciData[optionsCciData.length - 1].value.toFixed(2) : '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">CCI1 Period:</span>
                <span className="ml-1 font-medium text-gray-900">20</span>
              </div>
            </div>
          )}
          
          {/* CCI2 Info - BTC */}
          {btcCciData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-gray-200">
              <div>
                <span className="text-gray-600">CCI2 Indicator:</span>
                <span className="ml-1 font-medium text-gray-900">CCI (BTC)</span>
              </div>
              <div>
                <span className="text-gray-600">CCI2 Data Points:</span>
                <span className="ml-1 font-medium text-gray-900">{btcCciData.length}</span>
              </div>
              <div>
                <span className="text-gray-600">Latest CCI2:</span>
                <span className={`ml-1 font-medium ${
                  btcCciData.length > 0
                    ? btcCciData[btcCciData.length - 1].value > 100
                      ? 'text-red-600'
                      : btcCciData[btcCciData.length - 1].value < -100
                        ? 'text-green-600'
                        : 'text-gray-600'
                    : 'text-gray-600'
                }`}>
                  {btcCciData.length > 0 ? btcCciData[btcCciData.length - 1].value.toFixed(2) : '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">CCI2 Period:</span>
                <span className="ml-1 font-medium text-gray-900">20</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};