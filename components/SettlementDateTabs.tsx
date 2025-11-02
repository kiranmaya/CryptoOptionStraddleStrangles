// Settlement Date Tabs Component

import { useEffect, useState } from 'react';
import { fetchSettlementDates, formatSettlementDate } from '../utils/deltaApi';

interface SettlementDateTabsProps {
  onDateSelect: (date: string) => void;
  selectedDate?: string;
}

export const SettlementDateTabs: React.FC<SettlementDateTabsProps> = ({
  onDateSelect,
  selectedDate
}) => {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDates = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Check localStorage first for cached data
        const cachedData = localStorage.getItem('settlementDates');
        const cachedTimestamp = localStorage.getItem('settlementDatesTimestamp');
        
        const now = Date.now();
        const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
        
        if (cachedData && cachedTimestamp) {
          const timestamp = parseInt(cachedTimestamp);
          if (now - timestamp < CACHE_DURATION) {
            const parsedDates = JSON.parse(cachedData);
            setDates(parsedDates);
            setLoading(false);
            
            // Auto-select first date if none selected
            if (!selectedDate && parsedDates.length > 0) {
              onDateSelect(parsedDates[0]);
            }
            return;
          }
        }
        
        // Fetch fresh data
        const result = await fetchSettlementDates();
        
        if (result.error) {
          setError(result.error);
        } else {
          setDates(result.settlementDates);
          
          // Cache the data
          localStorage.setItem('settlementDates', JSON.stringify(result.settlementDates));
          localStorage.setItem('settlementDatesTimestamp', now.toString());
          
          // Auto-select first date if none selected
          if (!selectedDate && result.settlementDates.length > 0) {
            onDateSelect(result.settlementDates[0]);
          }
        }
      } catch (err) {
        console.error('Error loading settlement dates:', err);
        setError('Failed to load settlement dates');
      } finally {
        setLoading(false);
      }
    };

    loadDates();
  }, [onDateSelect, selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading settlement dates...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="text-red-700">{error}</span>
        </div>
        <button
          onClick={() => {
            // Clear cache and retry
            localStorage.removeItem('settlementDates');
            localStorage.removeItem('settlementDatesTimestamp');
            window.location.reload();
          }}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-yellow-700">No settlement dates available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Settlement Dates</h2>
      <div className="flex flex-wrap gap-2">
        {dates.map((date) => {
          const formattedDate = formatSettlementDate(date);
          const isSelected = selectedDate === date;
          
          return (
            <button
              key={date}
              onClick={() => onDateSelect(date)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isSelected
                  ? 'bg-blue-600 text-white shadow-md transform scale-105'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
                }
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              `}
            >
              {formattedDate}
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <div className="mt-3 text-sm text-gray-600">
          Selected: <span className="font-medium">{formatSettlementDate(selectedDate)}</span>
        </div>
      )}
    </div>
  );
};