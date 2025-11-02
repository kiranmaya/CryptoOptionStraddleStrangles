// Chart helpers for straddle/strangle calculations

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
  if (!callData.length || !putData.length) {
    return [];
  }

  // Sort data by time to ensure alignment
  const sortedCallData = [...callData].sort((a, b) => a.time - b.time);
  const sortedPutData = [...putData].sort((a, b) => a.time - b.time);

  const combinedData: CombinedCandleData[] = [];
  let callIndex = 0;
  let putIndex = 0;

  // Merge data by matching timestamps
  while (callIndex < sortedCallData.length && putIndex < sortedPutData.length) {
    const callCandle = sortedCallData[callIndex];
    const putCandle = sortedPutData[putIndex];

    if (callCandle.time === putCandle.time) {
      // Exact time match
      combinedData.push(calculateCombinedCandle(callCandle, putCandle, calculationMethod));
      callIndex++;
      putIndex++;
    } else if (callCandle.time < putCandle.time) {
      // Call candle is earlier, try to find matching put candle
      const nextPutIndex = findNextMatchingTime(sortedPutData, putIndex, callCandle.time);
      if (nextPutIndex !== -1) {
        combinedData.push(calculateCombinedCandle(callCandle, sortedPutData[nextPutIndex], calculationMethod));
        callIndex++;
        putIndex = nextPutIndex + 1;
      } else {
        callIndex++;
      }
    } else {
      // Put candle is earlier, try to find matching call candle
      const nextCallIndex = findNextMatchingTime(sortedCallData, callIndex, putCandle.time);
      if (nextCallIndex !== -1) {
        combinedData.push(calculateCombinedCandle(sortedCallData[nextCallIndex], putCandle, calculationMethod));
        callIndex = nextCallIndex + 1;
        putIndex++;
      } else {
        putIndex++;
      }
    }
  }

  return combinedData;
};

const findNextMatchingTime = (
  data: CandlestickData[],
  startIndex: number,
  targetTime: number
): number => {
  for (let i = startIndex; i < data.length; i++) {
    if (data[i].time === targetTime) {
      return i;
    }
    if (data[i].time > targetTime) {
      break;
    }
  }
  return -1;
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
  callStrike: number,
  putStrike: number,
  currentPrice: number
): number => {
  const callDistance = Math.abs(callStrike - currentPrice);
  const putDistance = Math.abs(putStrike - currentPrice);
  
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

// Export singleton instance
export const chartDataCache = new ChartDataCache();