// Chart helpers for straddle/strangle calculations

import { Selection } from '../components/OptionChainTable';
import { CandlestickData } from './deltaApi';

export interface CombinedCandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StraddleStrangleData {
  callSymbol: string;
  putSymbol: string;
  callData: CandlestickData[];
  putData: CandlestickData[];
  combinedData: CombinedCandleData[];
  calculationType: 'straddle' | 'strangle';
}

export type CalculationMethod = 'average' | 'sum';

export const combineOptionData = (
  callData: CandlestickData[],
  putData: CandlestickData[],
  calculationMethod: CalculationMethod = 'average'
): CombinedCandleData[] => {
  // Handle single option type selections
  if (callData.length && !putData.length) {
    // Only calls selected - return call data as combined data
    return callData.map(candle => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
  }

  if (!callData.length && putData.length) {
    // Only puts selected - return put data as combined data
    return putData.map(candle => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
  }

  // Both calls and puts selected - use improved combination logic
  if (!callData.length || !putData.length) {
    return [];
  }

  // Sort data by time to ensure alignment
  const sortedCallData = [...callData].sort((a, b) => a.time - b.time);
  const sortedPutData = [...putData].sort((a, b) => a.time - b.time);

  // Calculate average time interval to determine tolerance for matching
  const avgInterval = calculateAverageInterval(sortedCallData, sortedPutData);
  const matchingTolerance = Math.max(avgInterval * 0.5, 60); // Use larger of 50% of avg interval or 60 seconds

  const combinedData: CombinedCandleData[] = [];
  let callIndex = 0;
  let putIndex = 0;

  // Advanced merge with interpolation and tolerance
  while (callIndex < sortedCallData.length && putIndex < sortedPutData.length) {
    const callCandle = sortedCallData[callIndex];
    const putCandle = sortedPutData[putIndex];
    const timeDiff = Math.abs(callCandle.time - putCandle.time);

    if (timeDiff <= matchingTolerance) {
      // Close time match - use the one with the earlier time as reference
      const referenceTime = Math.min(callCandle.time, putCandle.time);
      const callMatch = callCandle.time === referenceTime ? callCandle : interpolateCandle(
        callIndex > 0 ? sortedCallData[callIndex - 1] : callCandle,
        callCandle,
        referenceTime
      );
      const putMatch = putCandle.time === referenceTime ? putCandle : interpolateCandle(
        putIndex > 0 ? sortedPutData[putIndex - 1] : putCandle,
        putCandle,
        referenceTime
      );

      combinedData.push(calculateCombinedCandle(callMatch, putMatch, calculationMethod));
      
      // Advance both indices
      if (callCandle.time <= putCandle.time) callIndex++;
      if (putCandle.time <= callCandle.time) putIndex++;
      
    } else if (callCandle.time < putCandle.time) {
      // Call candle is significantly earlier
      const nextPutMatch = findBestMatchCandle(sortedPutData, putIndex, callCandle.time);
      if (nextPutMatch) {
        combinedData.push(calculateCombinedCandle(callCandle, nextPutMatch.candle, calculationMethod));
        callIndex++;
        putIndex = nextPutMatch.index + 1;
      } else {
        callIndex++;
      }
    } else {
      // Put candle is significantly earlier
      const nextCallMatch = findBestMatchCandle(sortedCallData, callIndex, putCandle.time);
      if (nextCallMatch) {
        combinedData.push(calculateCombinedCandle(nextCallMatch.candle, putCandle, calculationMethod));
        putIndex++;
        callIndex = nextCallMatch.index + 1;
      } else {
        putIndex++;
      }
    }
  }

  // Add any remaining data points by interpolating or using the closest available
  while (callIndex < sortedCallData.length) {
    const remainingCall = sortedCallData[callIndex];
    const bestPutMatch = findBestMatchCandle(sortedPutData, putIndex, remainingCall.time);
    if (bestPutMatch) {
      combinedData.push(calculateCombinedCandle(remainingCall, bestPutMatch.candle, calculationMethod));
    }
    callIndex++;
  }

  while (putIndex < sortedPutData.length) {
    const remainingPut = sortedPutData[putIndex];
    const bestCallMatch = findBestMatchCandle(sortedCallData, callIndex, remainingPut.time);
    if (bestCallMatch) {
      combinedData.push(calculateCombinedCandle(bestCallMatch.candle, remainingPut, calculationMethod));
    }
    putIndex++;
  }

  // Sort the final combined data by time and remove duplicates
  return combinedData
    .sort((a, b) => a.time - b.time)
    .filter((candle, index, arr) => index === 0 || candle.time !== arr[index - 1].time);
};

const calculateAverageInterval = (
  callData: CandlestickData[],
  putData: CandlestickData[]
): number => {
  const allTimes = [...callData.map(c => c.time), ...putData.map(p => p.time)].sort((a, b) => a - b);
  
  if (allTimes.length < 2) return 300; // Default 5 minutes
  
  let totalInterval = 0;
  for (let i = 1; i < allTimes.length; i++) {
    totalInterval += allTimes[i] - allTimes[i - 1];
  }
  
  return totalInterval / (allTimes.length - 1);
};


const interpolateCandle = (
  previous: CandlestickData,
  current: CandlestickData,
  targetTime: number
): CandlestickData => {
  // Linear interpolation for OHLC values based on time difference
  const timeDiff = current.time - previous.time;
  const targetDiff = targetTime - previous.time;
  const ratio = timeDiff > 0 ? targetDiff / timeDiff : 0;

  return {
    time: targetTime,
    open: previous.close, // Use previous close as interpolated open
    high: previous.high + (current.high - previous.high) * ratio,
    low: previous.low + (current.low - previous.low) * ratio,
    close: previous.close + (current.close - previous.close) * ratio,
    volume: previous.volume || 0
  };
};

const findBestMatchCandle = (
  data: CandlestickData[],
  startIndex: number,
  targetTime: number
): { candle: CandlestickData; index: number } | null => {
  // First try exact match
  for (let i = startIndex; i < data.length; i++) {
    if (data[i].time === targetTime) {
      return { candle: data[i], index: i };
    }
    if (data[i].time > targetTime) {
      // Found the first candle after target time
      if (i > startIndex) {
        const previousCandle = data[i - 1];
        // If previous candle is reasonably close (within 2x the average interval), interpolate
        const timeDiff = data[i].time - previousCandle.time;
        const targetDiff = targetTime - previousCandle.time;
        
        if (Math.abs(targetDiff) <= timeDiff) {
          return { candle: interpolateCandle(previousCandle, data[i], targetTime), index: i };
        }
      }
      return { candle: data[i], index: i };
    }
  }
  
  // If no candle found after target time, use the last available candle
  if (data.length > startIndex) {
    return { candle: data[data.length - 1], index: data.length - 1 };
  }
  
  return null;
};

const calculateCombinedCandle = (
  callCandle: CandlestickData,
  putCandle: CandlestickData,
  calculationMethod: CalculationMethod
): CombinedCandleData => {
  const { open: callOpen, high: callHigh, low: callLow, close: callClose } = callCandle;
  const { open: putOpen, high: putHigh, low: putLow, close: putClose } = putCandle;

  let combinedOpen: number, combinedHigh: number, combinedLow: number, combinedClose: number;

  if (calculationMethod === 'average') {
    combinedOpen = (callOpen + putOpen) / 2;
    combinedHigh = (callHigh + putHigh) / 2;
    combinedLow = (callLow + putLow) / 2;
    combinedClose = (callClose + putClose) / 2;
  } else { // sum
    combinedOpen = callOpen + putOpen;
    combinedHigh = callHigh + putHigh;
    combinedLow = callLow + putLow;
    combinedClose = callClose + putClose;
  }

  return {
    time: callCandle.time,
    open: combinedOpen,
    high: combinedHigh,
    low: combinedLow,
    close: combinedClose,
    volume: (callCandle.volume || 0) + (putCandle.volume || 0)
  };
};

export const calculateStraddlePrice = (callPrice: number, putPrice: number): number => {
  return (callPrice + putPrice) / 2;
};

export const calculateStranglePrice = (
  callPrice: number,
  putPrice: number,
 
): number => {
   
  
  // For strangle, we typically use the sum since we're combining two different strikes
  return callPrice + putPrice;
};

export const formatPrice = (price: number): string => {
  return price.toFixed(2);
};

export const formatPercentage = (value: number): string => {
  return `${(value * 100).toFixed(2)}%`;
};

export const getStrikeRange = (calls: Array<{ strike_price: string }>, puts: Array<{ strike_price: string }>) => {
  const allStrikes = [...calls, ...puts].map(item => parseFloat(item.strike_price));
  const minStrike = Math.min(...allStrikes);
  const maxStrike = Math.max(...allStrikes);
  
  return { minStrike, maxStrike };
};

export const findATMStrike = (
  calls: Array<{ strike_price: string }>,
  puts: Array<{ strike_price: string }>,
  currentPrice: number
): number => {
  const allStrikes = [...calls, ...puts].map(item => parseFloat(item.strike_price));
  
  let closestStrike = allStrikes[0];
  let minDifference = Math.abs(allStrikes[0] - currentPrice);
  
  for (const strike of allStrikes) {
    const difference = Math.abs(strike - currentPrice);
    if (difference < minDifference) {
      minDifference = difference;
      closestStrike = strike;
    }
  }
  
  return closestStrike;
};

export const filterOptionsByStrike = (
  options: Array<{ strike_price: string; symbol: string }>,
  minStrike?: number,
  maxStrike?: number
): Array<{ strike_price: string; symbol: string }> => {
  return options.filter(option => {
    const strike = parseFloat(option.strike_price);
    if (minStrike && strike < minStrike) return false;
    if (maxStrike && strike > maxStrike) return false;
    return true;
  });
};

export const createStraddlePair = (
  calls: Array<{ strike_price: string; symbol: string }>,
  puts: Array<{ strike_price: string; symbol: string }>,
  targetStrike: number
): { callSymbol: string; putSymbol: string; strike: number } | null => {
  const callOption = calls.find(call => parseFloat(call.strike_price) === targetStrike);
  const putOption = puts.find(put => parseFloat(put.strike_price) === targetStrike);
  
  if (callOption && putOption) {
    return {
      callSymbol: callOption.symbol,
      putSymbol: putOption.symbol,
      strike: targetStrike
    };
  }
  
  return null;
};

export const createStranglePair = (
  calls: Array<{ strike_price: string; symbol: string }>,
  puts: Array<{ strike_price: string; symbol: string }>,
  callStrike: number,
  putStrike: number
): { callSymbol: string; putSymbol: string; callStrike: number; putStrike: number } | null => {
  const callOption = calls.find(call => parseFloat(call.strike_price) === callStrike);
  const putOption = puts.find(put => parseFloat(put.strike_price) === putStrike);
  
  if (callOption && putOption) {
    return {
      callSymbol: callOption.symbol,
      putSymbol: putOption.symbol,
      callStrike,
      putStrike
    };
  }
  
  return null;
};

// Cache management for improved performance
export class ChartDataCache {
  private cache = new Map<string, { data: CandlestickData[]; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  set(key: string, data: CandlestickData[]): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key: string): CandlestickData[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// P&L Strategy Builder Types and Utilities

export interface PnLDataPoint {
  price: number;
  pnl: number;
  label?: string;
}

export interface StrategyInfo {
  name: string;
  type: 'long_straddle' | 'short_straddle' | 'long_strangle' | 'short_strangle' | 'iron_condor' | 'butterfly' | 'custom';
  description: string;
  isLong: boolean;
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakevenPoints: number[];
}

// Calculate theoretical P&L for different option strategies
export const calculatePnL = (
  underlyingPrice: number,
  optionType: 'call' | 'put',
  strike: number,
  premium: number,
  position: 'long' | 'short',
  quantity: number = 1
): number => {
  let intrinsicValue = 0;
  
  if (optionType === 'call') {
    intrinsicValue = Math.max(0, underlyingPrice - strike);
  } else {
    intrinsicValue = Math.max(0, strike - underlyingPrice);
  }
  
  const optionPayoff = position === 'long'
    ? intrinsicValue - premium
    : premium - intrinsicValue;
  
  return optionPayoff * quantity;
};

// Generate P&L curve data for a strategy
export const generatePnLCurve = (
  selections: Selection[],
  priceRange: { min: number; max: number; points: number },
  currentPrice: number
): PnLDataPoint[] => {
  const { min, max, points } = priceRange;
  const priceStep = (max - min) / (points - 1);
  const pnlData: PnLDataPoint[] = [];
  
  // Separate calls and puts from selections
  const calls = selections.filter(s => s.type === 'call');
  const puts = selections.filter(s => s.type === 'put');
  
  // Use current price as premium if not available
  const getPremium = (selection: Selection): number => {
    if (selection.price && !isNaN(parseFloat(selection.price))) {
      return parseFloat(selection.price);
    }
    return currentPrice * 0.02; // Estimate 2% of current price as premium
  };
  
  for (let i = 0; i < points; i++) {
    const price = min + (priceStep * i);
    let totalPnL = 0;
    
    // Calculate P&L for each selected option
    selections.forEach(selection => {
      const premium = getPremium(selection);
      const isLong = true; // Current implementation assumes long positions
      const optionPnL = calculatePnL(
        price,
        selection.type,
        selection.strike,
        premium,
        isLong ? 'long' : 'short',
        1
      );
      totalPnL += optionPnL;
    });
    
    pnlData.push({
      price,
      pnl: totalPnL,
      label: price === currentPrice ? 'Current Price' : undefined
    });
  }
  
  return pnlData;
};

// Detect strategy type based on selected options
export const detectStrategy = (selections: Selection[]): StrategyInfo => {
  const calls = selections.filter(s => s.type === 'call');
  const puts = selections.filter(s => s.type === 'put');
  
  if (selections.length === 0) {
    return {
      name: 'No Strategy',
      type: 'custom',
      description: 'No options selected',
      isLong: true,
      maxProfit: 0,
      maxLoss: 0,
      breakevenPoints: []
    };
  }
  
  if (calls.length === 1 && puts.length === 1) {
    const callStrike = calls[0].strike;
    const putStrike = puts[0].strike;
    
    if (callStrike === putStrike) {
      return {
        name: 'Long Straddle',
        type: 'long_straddle',
        description: 'Buy call and put at same strike (ATM)',
        isLong: true,
        maxProfit: 'unlimited',
        maxLoss: callStrike + putStrike, // Premium paid
        breakevenPoints: [callStrike - callStrike, callStrike + callStrike]
      };
    } else {
      return {
        name: 'Long Strangle',
        type: 'long_strangle',
        description: 'Buy call and put at different strikes (OTM)',
        isLong: true,
        maxProfit: 'unlimited',
        maxLoss: (callStrike - Math.min(callStrike, putStrike)) + (Math.max(callStrike, putStrike) - putStrike),
        breakevenPoints: []
      };
    }
  }
  
  if (calls.length === 2 && puts.length === 0) {
    return {
      name: 'Bull Call Spread',
      type: 'butterfly',
      description: 'Buy lower strike call, sell higher strike call',
      isLong: true,
      maxProfit: calls[1].strike - calls[0].strike,
      maxLoss: calls[0].strike,
      breakevenPoints: []
    };
  }
  
  if (calls.length === 0 && puts.length === 2) {
    return {
      name: 'Bear Put Spread',
      type: 'butterfly',
      description: 'Buy higher strike put, sell lower strike put',
      isLong: true,
      maxProfit: puts[0].strike - puts[1].strike,
      maxLoss: puts[1].strike,
      breakevenPoints: []
    };
  }
  
  return {
    name: 'Custom Strategy',
    type: 'custom',
    description: `${calls.length} calls + ${puts.length} puts`,
    isLong: true,
    maxProfit: 'unlimited',
    maxLoss: 'unlimited',
    breakevenPoints: []
  };
};

// Calculate price range for P&L chart
export const calculatePriceRange = (
  selections: Selection[],
  currentPrice: number,
  volatility: number = 0.3
): { min: number; max: number; points: number } => {
  if (selections.length === 0) {
    return {
      min: currentPrice * 0.7,
      max: currentPrice * 1.3,
      points: 100
    };
  }
  
  // Get all strikes
  const strikes = selections.map(s => s.strike);
  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  
  // Add buffer based on volatility
  const buffer = currentPrice * volatility;
  
  return {
    min: Math.max(minStrike - buffer, currentPrice * 0.5),
    max: maxStrike + buffer,
    points: 200
  };
};

// Get strategy color based on P&L
export const getStrategyColor = (pnl: number, isProfitZone: boolean): string => {
  if (pnl > 0) return '#10b981'; // Green for profit
  if (pnl < 0) return '#ef4444'; // Red for loss
  return isProfitZone ? '#10b981' : '#ef4444'; // Default to green for zero
};

// Format P&L value for display
export const formatPnL = (value: number): string => {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

// Export singleton instance
export const chartDataCache = new ChartDataCache();