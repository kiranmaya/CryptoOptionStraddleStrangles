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