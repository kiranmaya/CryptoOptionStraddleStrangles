// Delta API interfaces and functions

export interface SettlementData {
  asset: string;
  settlement_time: string[];
}

export interface ApiResponse {
  result: Array<{
    contract_type: string;
    data: SettlementData[];
  }>;
}

export interface SettlementDateResult {
  settlementDates: string[];
  error?: string;
}

// API response interfaces
interface DeltaApiProduct {
  symbol: string;
  contract_type: string;
  strike_price: string;
  settlement_time: string;
  underlying_asset: {
    symbol: string;
    name: string;
  };
  volume_24h?: string;
  open_interest_24h?: string;
  mark_price?: string;
  bid_price?: string;
  ask_price?: string;
  expiry_date?: string;
  [key: string]: unknown;
}

interface DeltaApiResponse {
  success: boolean;
  result: DeltaApiProduct[];
  meta?: {
    after?: string;
    before?: string;
    limit: number;
    total_count: number;
  };
}

// Options data interfaces
export interface OptionContract {
  symbol: string;
  contract_type: 'call_options' | 'put_options';
  strike_price: string;
  settlement_time: string;
  underlying_asset: string;
  expiry_date: string;
  settlement_date: string;
  mark_price?: string;
  bid_price?: string;
  ask_price?: string;
  volume?: number;
  open_interest?: number;
}

export interface OptionChainData {
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandlestickResponse {
  success: boolean;
  result: {
    candles: Array<{
      time: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume?: string;
    }>;
  };
  meta?: Record<string, unknown>;
}

export const fetchSettlementDates = async (): Promise<SettlementDateResult> => {
  try {
    const response = await fetch('https://cdn.india.deltaex.org/web/options/info');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: ApiResponse = await response.json();
    
    // Find BTC call options data
    const btcCallOptions = data.result.find(
      result => result.contract_type === 'call_options' &&
      result.data.some(item => item.asset === 'BTC')
    );
    
    if (btcCallOptions) {
      const btcData = btcCallOptions.data.find(item => item.asset === 'BTC');
      if (btcData && btcData.settlement_time) {
        return { settlementDates: btcData.settlement_time };
      }
    }
    
    return { settlementDates: [] };
  } catch (err) {
    console.error('Error fetching settlement dates:', err);
    return { 
      settlementDates: [], 
      error: err instanceof Error ? err.message : 'Failed to fetch settlement dates' 
    };
  }
};

export const formatSettlementDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const year = date.getUTCFullYear().toString().slice(-2);
  return `${day} ${month} ${year}`;
};


const fetchWithRetry = async (url: string, options: RequestInit = {}) => {
  // Single attempt fetch - no retries
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Delta-Straddle-Dashboard/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    console.log(`API request: ${response.status} ${response.statusText}`);

    if (response.ok) {
      return response;
    }

    // Handle client errors (400-499) - typically indicate malformed requests
    if (response.status >= 400 && response.status < 500) {
      const errorText = await response.text();
      console.error(`Client error (${response.status}): ${response.statusText}. Response: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    // For other errors, throw immediately
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  } catch (error) {
    console.error(`Request error:`, error);
    throw error;
  }
};


export const fetchOptionChainData = async (settlementTime: string): Promise<OptionChainData> => {
  try {
    const baseUrl = 'https://api.india.delta.exchange/v2';
    const params = new URLSearchParams({
      contract_types: 'call_options,put_options',
      underlying_asset: 'BTC'
    });
    
    const response = await fetchWithRetry(`${baseUrl}/products?${params}`);
    const data: DeltaApiResponse = await response.json();
    
    // Check if the API response indicates success
    if (!data.success) {
      throw new Error('API request failed');
    }
    
    // Filter products by settlement date and map to OptionContract interface
    const allProducts: OptionContract[] = data.result.map((product: DeltaApiProduct) => ({
      symbol: product.symbol,
      contract_type: product.contract_type as 'call_options' | 'put_options',
      strike_price: product.strike_price,
      settlement_time: product.settlement_time,
      underlying_asset: product.underlying_asset.symbol,
      expiry_date: product.expiry_date || product.settlement_time.split('T')[0],
      settlement_date: product.settlement_time.split('T')[0],
      mark_price: product.mark_price,
      bid_price: product.bid_price,
      ask_price: product.ask_price,
      volume: product.volume_24h ? Number(product.volume_24h) : undefined,
      open_interest: product.open_interest_24h ? Number(product.open_interest_24h) : undefined
    }));
    
    // Filter for the selected settlement date and separate calls and puts
    const selectedDate = settlementTime.split('T')[0]; // Get just the date part
    const filteredProducts = allProducts.filter(product =>
      product.settlement_date.startsWith(selectedDate)
    );
    
    const calls = filteredProducts
      .filter(product => product.contract_type === 'call_options')
      .sort((a, b) => parseFloat(a.strike_price) - parseFloat(b.strike_price));
    
    const puts = filteredProducts
      .filter(product => product.contract_type === 'put_options')
      .sort((a, b) => parseFloat(a.strike_price) - parseFloat(b.strike_price));
    
    return { calls, puts };
  } catch (err) {
    console.error('Error fetching option chain data:', err);
    throw err; // Re-throw to show real error instead of falling back to mock data
  }
};


// Helper function to test API connectivity

export const fetchCandlestickData = async (
  symbol: string,
  resolution: string = '1',
  from?: number,
  to?: number
): Promise<CandlestickData[]> => {
  try {
    const baseUrl = 'https://api.india.delta.exchange/v2';
    const now = Math.floor(Date.now() / 1000);
    
    // Convert resolution to API format - API supports: 1m,3m,5m,15m,30m,1h,2h,4h,6h,1d,1w,2w,7d,30d
    const resolutionMap: Record<string, string> = {
      '1': '1m',
      '3': '3m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '120': '2h',
      '240': '4h',
      '360': '6h',
      '1440': '1d',
      '10080': '1w',
      '20160': '2w',
      '7d': '7d',
      '43200': '30d'
    };
    
    // Validate and convert resolution
    console.log(`[DeltaAPI] Fetching data for symbol: "${symbol}" with resolution: "${resolution}"`);
    const apiResolution = resolutionMap[resolution];
    
    if (!apiResolution) {
      throw new Error(`Invalid resolution: "${resolution}". Valid values: ${Object.keys(resolutionMap).join(', ')}`);
    }
    
    // For option symbols, use MARK: prefix to get historical data
    const effectiveSymbol = symbol.includes('-') ? `MARK:${symbol}` : symbol;
    console.log(`[DeltaAPI] Using effective symbol: "${effectiveSymbol}"`);
    
    const fromTime = from || (now - 7 * 24 * 60 * 60); // Default to 7 days ago for better data
    const toTime = to || now;
    
    // Build API URL with proper parameters
    const params = new URLSearchParams({
      symbol: effectiveSymbol,
      resolution: apiResolution,
      start: fromTime.toString(),
      end: toTime.toString()
    });
    
    const url = `${baseUrl}/history/candles?${params.toString()}`;
    console.log(`[DeltaAPI] Fetching candles from: ${url}`);
    
    try {
      const response = await fetchWithRetry(url);
      const data: CandlestickResponse = await response.json();
      
      if (data.success && Array.isArray(data.result)) {
        console.log(`[DeltaAPI] Successfully fetched ${data.result.length} candles for ${symbol}`);
        const formattedData = data.result.map(candle => ({
          time: candle.time,
          open: parseFloat(candle.open || '0'),
          high: parseFloat(candle.high || '0'),
          low: parseFloat(candle.low || '0'),
          close: parseFloat(candle.close || '0'),
          volume: candle.volume ? parseFloat(candle.volume) : undefined
        }));
        
        // Sort data in ascending order by time for chart compatibility
        return formattedData.sort((a, b) => a.time - b.time);
      } else {
        console.warn(`[DeltaAPI] No data found for ${symbol}:`, data);
        return []; // Return empty array instead of throwing error
      }
    } catch (err) {
      console.error(`[DeltaAPI] API request failed for ${symbol}:`, err);
      return []; // Return empty array instead of throwing error
    }
  } catch (err) {
    console.error('[DeltaAPI] Error fetching candlestick data:', err);
    return []; // Return empty array instead of throwing error
  }
};

export const fetchBTCPrice = async (): Promise<number> => {
  try {
    const response = await fetchWithRetry('https://api.india.delta.exchange/v2/tickers/BTCUSD');
    const data = await response.json();
    
    if (data.success) {
      return parseFloat(data.result.mark_price);
    }
    
    throw new Error('Invalid response');
  } catch (err) {
    console.error('Error fetching BTC price:', err);
    throw err; // Re-throw to show real error instead of falling back to mock data
  }
};