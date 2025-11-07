// API route to fetch option chain data with CORS handling
import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

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
}

interface DeltaApiResponse {
  success: boolean;
  result: DeltaApiProduct[];
}

interface OptionContract {
  symbol: string;
  contract_type: 'call_options' | 'put_options';
  strike_price: string;
  settlement_time: string;
  underlying_asset: string;
  expiry_date?: string;
  settlement_date?: string;
  mark_price?: string;
  bid_price?: string;
  ask_price?: string;
  volume?: number;
  open_interest?: number;
}

interface OptionChainData {
  calls: OptionContract[];
  puts: OptionContract[];
}

interface CacheItem {
  data: OptionChainData;
  timestamp: number;
}

const cache: { [key: string]: CacheItem } = {};

async function fetchWithRetry(url: string, retries: number = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Delta-Straddle-Dashboard/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        // Add a small delay between retries
        ...(i > 0 && { 
          next: { revalidate: 0 }, // Force no cache for retries
          cache: 'no-store'
        })
      });
      
      if (response.ok) {
        return response;
      }
      
      // Check for rate limiting
      if (response.status === 429) {
        console.log(`Rate limited, waiting before retry ${i + 1}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        continue;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Attempt ${i + 1} failed, retrying...`, error);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  
  throw new Error('All retries failed');
}

function getCacheKey(url: string, params: Record<string, string>): string {
  return `${url}?${new URLSearchParams(params).toString()}`;
}

function getCachedData(key: string): OptionChainData | null {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: OptionChainData): void {
  cache[key] = { data, timestamp: Date.now() };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const settlementTime = searchParams.get('settlementTime');
    const underlyingAsset = searchParams.get('underlyingAsset') || 'BTC';
    
    if (!settlementTime) {
      return NextResponse.json(
        { error: 'Missing required parameter: settlementTime' },
        { status: 400 }
      );
    }
    
    const baseUrl = 'https://api.india.delta.exchange/v2';
    const params = {
      contract_types: 'call_options,put_options',
      underlying_asset: underlyingAsset
    };
    
    const cacheKey = getCacheKey(`${baseUrl}/products`, params);
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      console.log('✅ Returning cached option chain data');
      return NextResponse.json(cached);
    }
    
    console.log('🔄 Fetching fresh option chain data...');
    
    const response = await fetchWithRetry(`${baseUrl}/products?${new URLSearchParams(params)}`);
    const data: DeltaApiResponse = await response.json();
    
    // Check if the API response indicates success
    if (!data.success) {
      return NextResponse.json(
        { error: 'Delta API returned unsuccessful response', details: data },
        { status: 502 }
      );
    }
    
    // Filter products by settlement date and underlying asset
    const selectedDate = settlementTime.split('T')[0];
    const filteredProducts = data.result.filter((product: DeltaApiProduct) => {
      return product.underlying_asset.symbol === underlyingAsset &&
             product.settlement_time.startsWith(selectedDate);
    });
    
    // Map to expected format
    const calls = filteredProducts
      .filter((product: DeltaApiProduct) => product.contract_type === 'call_options')
      .sort((a: DeltaApiProduct, b: DeltaApiProduct) => parseFloat(a.strike_price) - parseFloat(b.strike_price))
      .map((product: DeltaApiProduct): OptionContract => ({
        symbol: product.symbol,
        contract_type: product.contract_type as 'call_options',
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
    
    const puts = filteredProducts
      .filter((product: DeltaApiProduct) => product.contract_type === 'put_options')
      .sort((a: DeltaApiProduct, b: DeltaApiProduct) => parseFloat(a.strike_price) - parseFloat(b.strike_price))
      .map((product: DeltaApiProduct): OptionContract => ({
        symbol: product.symbol,
        contract_type: product.contract_type as 'put_options',
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
    
    const result: OptionChainData = { calls, puts };
    
    // Cache the result
    setCachedData(cacheKey, result);
    
    console.log(`✅ Successfully fetched ${calls.length} calls and ${puts.length} puts`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Error in option-chain API:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Return detailed error for debugging
    return NextResponse.json(
      { 
        error: 'Failed to fetch option chain data',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}