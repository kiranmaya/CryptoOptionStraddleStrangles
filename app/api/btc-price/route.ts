// API route to fetch BTC price
import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes cache

interface CacheItem {
  data: { price: number; timestamp: number };
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

function getCachedData(key: string): { price: number; timestamp: number } | null {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: { price: number; timestamp: number }): void {
  cache[key] = { data, timestamp: Date.now() };
}

export async function GET(request: NextRequest) {
  try {
    const cacheKey = 'btc-price';
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      console.log('✅ Returning cached BTC price');
      return NextResponse.json(cached);
    }
    
    console.log('🔄 Fetching fresh BTC price...');
    
    const response = await fetchWithRetry('https://api.india.delta.exchange/v2/tickers/BTCUSD');
    const data = await response.json();
    
    if (data.success) {
      const price = parseFloat(data.result.mark_price);
      const result = { price, timestamp: Date.now() };
      
      // Cache the result
      setCachedData(cacheKey, result);
      
      console.log(`✅ Successfully fetched BTC price: $${price}`);
      
      return NextResponse.json(result);
    }
    
    throw new Error('Invalid response');
    
  } catch (error) {
    console.error('❌ Error in btc-price API:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch BTC price',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}