// Option Chain Table Component

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OptionContract, fetchBTCPrice, fetchOptionChainData } from '../utils/deltaApi';

interface OptionChainTableProps {
  selectedDate: string;
  onSelectionChange: (selections: Selection[]) => void;
}

export interface Selection {
  type: 'call' | 'put';
  symbol: string;
  strike: number;
  price?: string;
  settlementDate: string; // Add settlement date to each selection
}

export const OptionChainTable: React.FC<OptionChainTableProps> = ({
  selectedDate,
  onSelectionChange
}) => {
  const [optionData, setOptionData] = useState<{
    calls: OptionContract[];
    puts: OptionContract[];
  }>({ calls: [], puts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [btcPriceLoading, setBtcPriceLoading] = useState(false);
  const [btcPriceError, setBtcPriceError] = useState<string | null>(null);

  const handleSelectionChange = useCallback((newSelections: Selection[]) => {
    setSelections(newSelections);
    onSelectionChange(newSelections);
  }, [onSelectionChange]);

  const clearSelections = useCallback(() => {
    setSelections([]);
    onSelectionChange([]);
  }, [onSelectionChange]);

  useEffect(() => {
    let isMounted = true;
     
    const loadOptionChain = async () => {
      if (!selectedDate) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const data = await fetchOptionChainData(selectedDate);
        
        if (isMounted) {
          setOptionData(data);
          setIsDataLoaded(true);
        }
        
        // NOTE: We no longer clear selections when date changes
        // This allows selections to persist across date switches
      } catch (err) {
        if (isMounted) {
          console.error('Error loading option chain:', err);
          setError('Failed to load option chain data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (selectedDate) {
      loadOptionChain();
    }

    return () => {
      isMounted = false;
    };
  }, [selectedDate, onSelectionChange]);

  // Remove the reset of data loaded state to allow multiple date loading
  // This enables selections to persist across date switches

  const handleCellClick = useCallback((option: OptionContract, type: 'call' | 'put') => {
    const selection: Selection = {
      type,
      symbol: option.symbol,
      strike: parseFloat(option.strike_price),
      // Remove price dependency - we'll fetch candlestick data using symbol
      price: undefined,
      settlementDate: selectedDate
    };

    const isSelected = selections.some(s => s.symbol === selection.symbol);
    
    let newSelections: Selection[];
    if (isSelected) {
      newSelections = selections.filter(s => s.symbol !== selection.symbol);
    } else {
      // Allow multiple selections for building combined charts
      newSelections = [...selections, selection];
    }
    
    console.log('[OptionChainTable] Selection changed:', newSelections);
    setSelections(newSelections);
  }, [selections]);

  // Separate effect to handle onSelectionChange updates
  useEffect(() => {
    onSelectionChange(selections);
  }, [selections, onSelectionChange]);

  const getStrikeRange = useMemo(() => {
    const allStrikes = [
      ...optionData.calls.map(c => parseFloat(c.strike_price)),
      ...optionData.puts.map(p => parseFloat(p.strike_price))
    ];
    
    if (allStrikes.length === 0) return { min: 0, max: 0 };
    
    return {
      min: Math.min(...allStrikes),
      max: Math.max(...allStrikes)
    };
  }, [optionData.calls, optionData.puts]);

  const isSelected = useCallback((symbol: string) => {
    return selections.some(s => s.symbol === symbol);
  }, [selections]);

  const formatPrice = useCallback((price: string | undefined) => {
    if (!price) return '-';
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? '-' : numPrice.toFixed(2);
  }, []);

  const formatVolume = useCallback((volume: number | undefined) => {
    if (!volume) return '-';
    return volume.toLocaleString();
  }, []);

  // Fetch BTC price
  const loadBTCPrice = useCallback(async () => {
    try {
      setBtcPriceLoading(true);
      setBtcPriceError(null);
      const price = await fetchBTCPrice();
      setBtcPrice(price);
    } catch (err) {
      console.error('Error fetching BTC price:', err);
      setBtcPriceError('Failed to fetch BTC price');
    } finally {
      setBtcPriceLoading(false);
    }
  }, []);

  // Calculate the current strike (closest to BTC price)
  const currentStrike = useMemo(() => {
    if (!btcPrice || optionData.calls.length === 0) return null;
    
    const allStrikes = [
      ...optionData.calls.map(c => parseFloat(c.strike_price)),
      ...optionData.puts.map(p => parseFloat(p.strike_price))
    ];
    
    if (allStrikes.length === 0) return null;
    
    // Find the strike closest to BTC price
    const closestStrike = allStrikes.reduce((prev, curr) => {
      return Math.abs(curr - btcPrice) < Math.abs(prev - btcPrice) ? curr : prev;
    });
    
    return closestStrike;
  }, [btcPrice, optionData.calls, optionData.puts]);

  // Get strikes range info
  const strikesInfo = useMemo(() => {
    const allStrikes = [
      ...optionData.calls.map(c => parseFloat(c.strike_price)),
      ...optionData.puts.map(p => parseFloat(p.strike_price))
    ];
    
    if (allStrikes.length === 0) return null;
    
    return {
      min: Math.min(...allStrikes),
      max: Math.max(...allStrikes),
      total: allStrikes.length,
      range: Math.max(...allStrikes) - Math.min(...allStrikes)
    };
  }, [optionData.calls, optionData.puts]);

  // Load BTC price when component mounts
  useEffect(() => {
    loadBTCPrice();
  }, [loadBTCPrice]);

  // Helper function to get filtered calls
  const getFilteredCalls = useMemo(() => {
    if (!optionData.calls.length) return [];
    
    const allCalls = [...optionData.calls].sort((a, b) => parseFloat(a.strike_price) - parseFloat(b.strike_price));
    
    if (!currentStrike) return optionData.calls;
    
    const allStrikes = allCalls.map(call => parseFloat(call.strike_price));
    const currentStrikeIndex = allStrikes.indexOf(currentStrike);
    
    if (currentStrikeIndex === -1) return optionData.calls;
    
    // Calculate range: current strike ± 12 strikes
    const startIndex = Math.max(0, currentStrikeIndex - 20);
    const endIndex = Math.min(allCalls.length - 1, currentStrikeIndex + 20);
    
    return allCalls.slice(startIndex, endIndex + 1);
  }, [optionData.calls, currentStrike]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-3">
        <div className="animate-pulse">
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-3">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg className="w-4 h-4 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (optionData.calls.length === 0 && optionData.puts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-3">
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <svg className="w-4 h-4 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-yellow-700 text-sm">No option data available for this date</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {/* BTC Price and Current Strike Info */}
          <div className="flex items-center space-x-3 text-xs">
            {btcPriceLoading ? (
              <div className="flex items-center text-gray-500">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500 mr-1"></div>
                Loading BTC...
              </div>
            ) : btcPriceError ? (
              <div className="text-red-500 text-xs">
                {btcPriceError}
              </div>
            ) : btcPrice ? (
              <div className="text-right">
                <div className="font-semibold text-gray-900">
                  BTC: ${btcPrice.toLocaleString()}
                </div>
                {currentStrike && (
                  <div className="text-xs text-gray-600">
                    ATM: ${currentStrike.toLocaleString()}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          
          {/* Strikes Info */}
          {strikesInfo && (
            <div className="text-xs text-gray-500">
              <span>Strikes: {strikesInfo.min.toLocaleString()} - {strikesInfo.max.toLocaleString()} ({strikesInfo.total} total)</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Call
              </th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Strike
              </th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Put
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Combine calls and puts by strike price - filter to show current strike centered with 12 strikes each side */}
            {getFilteredCalls.map((call) => {
              const strike = parseFloat(call.strike_price);
              const put = optionData.puts.find(p => p.strike_price === call.strike_price);
              const isHighlighted = hoveredStrike === strike;
              const isCurrentStrike = currentStrike === strike;
              const isCallSelected = isSelected(call.symbol);
              const isPutSelected = put ? isSelected(put.symbol) : false;
              
              return (
                <tr
                  key={call.symbol}
                  className={`
                    transition-all duration-200
                    ${isCurrentStrike ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}
                    ${isHighlighted && !isCurrentStrike ? 'bg-blue-50' : ''}
                    ${(isCallSelected || isPutSelected) && !isCurrentStrike ? 'ring-2 ring-blue-300 bg-blue-25' : ''}
                    ${isCurrentStrike && (isCallSelected || isPutSelected) ? 'ring-2 ring-yellow-300 bg-yellow-100' : ''}
                    hover:bg-gray-50
                  `}
                  onMouseEnter={() => setHoveredStrike(strike)}
                  onMouseLeave={() => setHoveredStrike(null)}
                >
                  {/* Call Symbol */}
                  <td className="px-2 py-2">
                    <button
                      onClick={() => handleCellClick(call, 'call')}
                      className={`
                        w-full text-left px-2 py-2 rounded text-xs font-medium transition-all duration-200
                        ${isCallSelected
                          ? 'bg-green-600 text-white shadow-md ring-1 ring-green-400'
                          : 'bg-green-50 text-green-800 hover:bg-green-100 hover:shadow-sm border border-green-200'
                        }
                      `}
                      title={`Click to select ${call.symbol} (Call)`}
                    >
                      <div className="font-mono text-xs">
                        {call.symbol}
                      </div>
                      {isCallSelected && (
                        <div className="flex items-center mt-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="ml-1 text-xs">✓</span>
                        </div>
                      )}
                    </button>
                  </td>
                  
                  {/* Strike Price */}
                  <td className="px-2 py-2 text-center">
                    <div className="flex flex-col items-center">
                      <span className={`
                        text-xs font-semibold
                        ${isCurrentStrike ? 'text-yellow-700' : isHighlighted ? 'text-blue-600' : 'text-gray-900'}
                      `}>
                        {formatPrice(call.strike_price)}
                      </span>
                      {isCurrentStrike && (
                        <span className="text-xs text-yellow-600 font-medium">
                          ATM
                        </span>
                      )}
                    </div>
                  </td>
                  
                  {/* Put Symbol */}
                  <td className="px-2 py-2">
                    {put ? (
                      <button
                        onClick={() => handleCellClick(put, 'put')}
                        className={`
                          w-full text-right px-2 py-2 rounded text-xs font-medium transition-all duration-200
                          ${isPutSelected
                            ? 'bg-red-600 text-white shadow-md ring-1 ring-red-400'
                            : 'bg-red-50 text-red-800 hover:bg-red-100 hover:shadow-sm border border-red-200'
                          }
                        `}
                        title={`Click to select ${put.symbol} (Put)`}
                      >
                        <div className="font-mono text-xs">
                          {put.symbol}
                        </div>
                        {isPutSelected && (
                          <div className="flex items-center justify-end mt-1">
                            <span className="mr-1 text-xs">✓</span>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ) : (
                      <div className="text-gray-400 text-center py-2 text-xs">No Put</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Selection Summary */}
      {selections.length > 0 && (
        <div className="p-2 bg-blue-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-900">
                Selected: {selections.length} option(s)
              </span>
              <div className="text-xs text-gray-600">
                {selections.filter(s => s.type === 'call').length} calls, {selections.filter(s => s.type === 'put').length} puts
              </div>
            </div>
            <button
              onClick={clearSelections}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
};