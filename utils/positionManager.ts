// Position Management System for Options Trading

import { Selection } from '../components/OptionChainTable';

// Position interface
export interface Position {
  id: string;
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  position: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  entryTime: number;
  settlementDate: string;
  currentPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
}

// Position summary for portfolio
export interface PositionSummary {
  totalPositions: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalMargin: number;
  netPnl: number;
  longPositions: number;
  shortPositions: number;
}

// Portfolio interface
export interface Portfolio {
  positions: Position[];
  cash: number;
  totalValue: number;
  totalPnl: number;
  margin: number;
}

// Generate unique position ID
export const generatePositionId = (): string => {
  return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Create new position
export const createPosition = (
  option: Selection,
  position: 'long' | 'short',
  quantity: number = 1,
  entryPrice: number
): Position => {
  return {
    id: generatePositionId(),
    symbol: option.symbol,
    type: option.type,
    strike: option.strike,
    position,
    quantity,
    entryPrice,
    entryTime: Date.now(),
    settlementDate: option.settlementDate
  };
};

// Calculate unrealized P&L for a position
export const calculatePositionPnl = (
  position: Position,
  currentOptionPrice: number,
  currentBtcPrice: number
): number => {
  const { position: pos, entryPrice, quantity, type, strike } = position;
  
  let optionValue = 0;
  if (type === 'call') {
    optionValue = Math.max(0, currentBtcPrice - strike);
  } else {
    optionValue = Math.max(0, strike - currentBtcPrice);
  }
  
  const pnlPerOption = pos === 'long' 
    ? (optionValue - entryPrice) 
    : (entryPrice - optionValue);
    
  return pnlPerOption * quantity;
};

// Generate P&L curve for portfolio at different BTC prices
export const generatePortfolioPnLCurve = (
  positions: Position[],
  btcPriceRange: { min: number; max: number; points: number }
): Array<{ btcPrice: number; pnl: number }> => {
  const { min, max, points } = btcPriceRange;
  const priceStep = (max - min) / (points - 1);
  const curve: Array<{ btcPrice: number; pnl: number }> = [];
  
  for (let i = 0; i < points; i++) {
    const btcPrice = min + (priceStep * i);
    let totalPnl = 0;
    
    // Calculate P&L for each position at this BTC price
    positions.forEach(position => {
      let optionValue = 0;
      if (position.type === 'call') {
        optionValue = Math.max(0, btcPrice - position.strike);
      } else {
        optionValue = Math.max(0, position.strike - btcPrice);
      }
      
      const pnlPerOption = position.position === 'long' 
        ? (optionValue - position.entryPrice)
        : (position.entryPrice - optionValue);
        
      totalPnl += pnlPerOption * position.quantity;
    });
    
    curve.push({ btcPrice, pnl: totalPnl });
  }
  
  return curve;
};

// Calculate portfolio summary
export const calculatePortfolioSummary = (positions: Position[], currentBtcPrice: number): PositionSummary => {
  let totalUnrealizedPnl = 0;
  const totalRealizedPnl = 0;
  let totalMargin = 0;
  let longPositions = 0;
  let shortPositions = 0;
  
  positions.forEach(position => {
    if (position.position === 'long') {
      longPositions++;
      // Long positions require full premium as margin
      totalMargin += position.entryPrice * position.quantity;
    } else {
      shortPositions++;
      // Short positions require higher margin (typically 2x premium)
      totalMargin += position.entryPrice * position.quantity * 2;
    }
    
    // For unrealized P&L, we need current option prices
    // In a real app, this would come from the API
    if (position.currentPrice) {
      const pnl = position.unrealizedPnl || 0;
      if (pnl >= 0) {
        totalUnrealizedPnl += pnl;
      } else {
        totalUnrealizedPnl += pnl; // Negative P&L is still part of unrealized
      }
    }
  });
  
  const netPnl = totalUnrealizedPnl + totalRealizedPnl;
  
  return {
    totalPositions: positions.length,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalMargin,
    netPnl,
    longPositions,
    shortPositions
  };
};

// Position management functions
export class PositionManager {
  private positions: Position[] = [];
  
  constructor(initialPositions: Position[] = []) {
    this.positions = [...initialPositions];
  }
  
  addPosition(position: Position): void {
    this.positions.push(position);
  }
  
  closePosition(positionId: string, closePrice: number, closeTime: number = Date.now()): Position | null {
    const positionIndex = this.positions.findIndex(p => p.id === positionId);
    if (positionIndex === -1) return null;
    
    const position = this.positions[positionIndex];
    const realizedPnl = position.position === 'long'
      ? (closePrice - position.entryPrice) * position.quantity
      : (position.entryPrice - closePrice) * position.quantity;
      
    position.realizedPnl = realizedPnl;
    position.currentPrice = closePrice;
    position.unrealizedPnl = 0;
    
    // Move to closed positions (in a real app, you'd have separate arrays)
    this.positions.splice(positionIndex, 1);
    return position;
  }

  removePosition(positionId: string): Position | null {
    const positionIndex = this.positions.findIndex(p => p.id === positionId);
    if (positionIndex === -1) return null;
    
    const position = this.positions[positionIndex];
    // Remove the position without calculating realized P&L
    this.positions.splice(positionIndex, 1);
    return position;
  }
  
  updatePositionPrice(positionId: string, newPrice: number): void {
    const position = this.positions.find(p => p.id === positionId);
    if (position) {
      position.currentPrice = newPrice;
    }
  }
  
  getAllPositions(): Position[] {
    return [...this.positions];
  }
  
  getPositionById(positionId: string): Position | undefined {
    return this.positions.find(p => p.id === positionId);
  }
  
  getPortfolioSummary(currentBtcPrice: number): PositionSummary {
    return calculatePortfolioSummary(this.positions, currentBtcPrice);
  }
  
  clearAllPositions(): void {
    this.positions = [];
  }
}

// Format P&L for display
export const formatPnl = (value: number): string => {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

// Format position for display
export const formatPosition = (position: Position): string => {
  return `${position.position === 'long' ? 'Long' : 'Short'} ${position.quantity} ${position.type.toUpperCase()} ${position.strike}`;
};