// API route to fetch option ticker data
import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL = 1 * 60 * 1000; // 1 minute cache

interface CacheItem {
  data: {
    mark_price: string;
    bid_price: string;
    ask_price: string;
    change_24h: string;
    volume_24h: string;
  };
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
        }
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

function getCachedData(key: string): CacheItem['data'] | null {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: CacheItem['data']): void {
  cache[key] = { data, timestamp: Date.now() };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }
    
    const cacheKey = `ticker-${symbol}`;
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      console.log(`✅ Returning cached ticker data for ${symbol}`);
      return NextResponse.json(cached);
    }
    
    console.log(`🔄 Fetching fresh ticker data for ${symbol}...`);
    
    const response = await fetchWithRetry(`https://api.india.delta.exchange/v2/tickers/${symbol}`);
    const data = await response.json();
    
    if (data.success && data.result) {
      const result = {
        mark_price: data.result.mark_price,
        bid_price: data.result.bid_price,
        ask_price: data.result.ask_price,
        change_24h: data.result.change_24h,
        volume_24h: data.result.volume_24h
      };
      
      // Cache the result
      setCachedData(cacheKey, result);
      
      console.log(`✅ Successfully fetched ticker data for ${symbol}`);
      
      return NextResponse.json(result);
    }
    
    console.warn(`No ticker data found for symbol: ${symbol}`);
    return NextResponse.json(
      { error: 'Symbol not found or no data available' },
      { status: 404 }
    );
    
  } catch (error) {
    console.error(`❌ Error in option-ticker API:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch option ticker data',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}