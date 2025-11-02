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

export const CombinedChart: React.FC<CombinedChartProps> = ({
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

  const { connected, subscribeCandlesticks, subscribeMarkPrices, onMessage, offMessage } = useDeltaWebSocket();

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

    // Initialize chart with multiple panes support (4 panes in new order)
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 1000, // Increased height for 4 panes
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

    // Set pane heights for 4 panes in new order
    const initializePanes = () => {
      const panes = chart.panes();
      console.log(`[CombinedChart] Found ${panes.length} panes`);
      
      if (panes.length >= 4) {
        // Set heights for 4 panes in new order
        const paneHeights = [250, 250, 250, 250]; // Options, CCI1, BTC, CCI2
        panes.forEach((pane, index) => {
          if (paneHeights[index]) {
            pane.setHeight(paneHeights[index]);
            console.log(`[CombinedChart] Set pane ${index} height: ${paneHeights[index]}px`);
          }
        });
        
        // Fit content and auto-scale price scales
        chart.timeScale().fitContent();
        
        // Auto-scale all price scales
        panes.forEach((pane, index) => {
          console.log(`[CombinedChart] Auto-scaling pane ${index}`);
          pane.priceScale('right').applyOptions({ autoScale: true });
        });
        
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
            chart.applyOptions({
              width: Math.floor(width),
              height: Math.floor(height),
            });
            
            // Re-initialize panes after resize to maintain proper heights
            setTimeout(() => {
              const panes = chart.panes();
              if (panes.length >= 4) {
                const paneHeights = [280, 220, 250, 250];
                panes.forEach((pane, index) => {
                  if (paneHeights[index]) {
                    pane.setHeight(paneHeights[index]);
                  }
                });
                chart.timeScale().fitContent();
                panes.forEach(pane => {
                  pane.priceScale('right').applyOptions({ autoScale: true });
                });
              }
            }, 100);
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
        
        const formattedData = chartData.map(candle => ({
          time: candle.time as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));

        console.log(`[CombinedChart] First candle:`, formattedData[0]);
        console.log(`[CombinedChart] Last candle:`, formattedData[formattedData.length - 1]);

        optionsSeriesRef.current.setData(formattedData);
        // Calculate and set CCI1 data for combined options
        if (optionsCciSeriesRef.current) {
          const calculatedCCIi = calculateCCI(chartData);
          setOptionsCciData(calculatedCCIi);
          
          const cciFormattedData = calculatedCCIi.map(cci => ({
            time: cci.time as UTCTimestamp,
            value: cci.value,
          }));
          
          optionsCciSeriesRef.current.setData(cciFormattedData);
          
          // Set reference line data for CCI1 pane (+100 and -100)
          if (calculatedCCIi.length > 0 && optionsCciSeriesRef.current) {
            // Clear existing price lines first to prevent duplication
            optionsCciPriceLinesRef.current.forEach(line => {
              if (line && typeof line === 'object' && 'remove' in line) {
                (line as { remove: () => void }).remove();
              }
            });
            optionsCciPriceLinesRef.current = [];
            
            // Create new price lines for CCI1 (+100 and -100) with unique titles
            const plus100Line = optionsCciSeriesRef.current.createPriceLine({
              price: 100,
              color: '#ef4444',
              lineWidth: 1,
              lineStyle: 2, // Dashed line
              axisLabelVisible: true,
              title: 'CCI1 +100',
            });
            
            const minus100Line = optionsCciSeriesRef.current.createPriceLine({
              price: -100,
              color: '#10b981',
              lineWidth: 1,
              lineStyle: 2, // Dashed line
              axisLabelVisible: true,
              title: 'CCI1 -100',
            });
            
            // Store references to the price lines
            optionsCciPriceLinesRef.current = [plus100Line, minus100Line];
            
            console.log(`[CombinedChart] CCI1 price lines created successfully`);
          }
          console.log(`[CombinedChart] Set ${calculatedCCIi.length} CCI1 data points`);
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
      const formattedData = btcData.map(candle => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

      btcSeriesRef.current.setData(formattedData);
      
      // Calculate CCI2 for BTC
      if (btcCciSeriesRef.current) {
        const calculatedBtcCCI = calculateCCI(btcData);
        setBtcCciData(calculatedBtcCCI);
        
        const btcCciFormattedData = calculatedBtcCCI.map(cci => ({
          time: cci.time as UTCTimestamp,
          value: cci.value,
        }));
        
        btcCciSeriesRef.current.setData(btcCciFormattedData);
        console.log(`[CombinedChart] Set ${calculatedBtcCCI.length} CCI2 (BTC) data points`);
        
        // Create price lines for CCI2 (+100 and -100)
        if (calculatedBtcCCI.length > 0 && btcCciSeriesRef.current) {
          // Clear existing price lines first to prevent duplication
          btcCciPriceLinesRef.current.forEach(line => {
            if (line && typeof line === 'object' && 'remove' in line) {
              (line as { remove: () => void }).remove();
            }
          });
          btcCciPriceLinesRef.current = [];
          
          // Create new price lines for CCI2 (+100 and -100) with unique titles
          const plus100Line1 = btcCciSeriesRef.current.createPriceLine({
            price: 100,
            color: '#ef4444',
            lineWidth: 1,
            lineStyle: 2, // Dashed line
            axisLabelVisible: true,
            title: 'CCI2 +100',
          });
          
          const minus100Line1 = btcCciSeriesRef.current.createPriceLine({
            price: -100,
            color: '#10b981',
            lineWidth: 1,
            lineStyle: 2, // Dashed line
            axisLabelVisible: true,
            title: 'CCI2 -100',
          });
          
          // Store references to the price lines
          btcCciPriceLinesRef.current = [plus100Line1, minus100Line1];
          
          console.log(`[CombinedChart] CCI2 price lines created successfully`);
        }
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
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Chart Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Combined Options + BTC Chart with Dual CCI</h2>
            <div className="flex items-center space-x-4 mt-1">
              <p className="text-sm text-gray-600">{getChartTitle()}</p>
              {btcPrice > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="text-lg font-bold text-gray-900">
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
            {/* Resolution Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Resolution:</span>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="text-sm text-gray-900 border border-gray-300 rounded-lg px-3 py-1 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="1" >1m</option>
                <option value="3">3m</option>
                <option value="5">5m</option>
                <option value="15">15m</option>
                <option value="30">30m</option>
              </select>
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
            className="w-full h-[900px] rounded-lg border border-gray-200"
          />
        )}
      </div>
      
      {/* Chart Info */}
      {chartData.length > 0 && !error && (
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