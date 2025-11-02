# Delta Exchange Options Straddle/Strangle Dashboard

A comprehensive real-time options analysis dashboard built with Next.js, TypeScript, and Lightweight Charts. This dashboard provides dynamic settlement date selection, interactive option chain analysis, and combined straddle/strangle visualization with live Bitcoin price tracking.

## 🚀 Features

### ✅ Core Functionality

- **Dynamic Settlement Dates** - Fetches available expiry dates from Delta Exchange API
- **Interactive Option Chain Table** - Clickable cells to select multiple call/put options
- **Real-time Combined Charts** - Straddle/strangle visualization with live data
- **Bitcoin Price Tracking** - Underlying asset price chart for market context
- **WebSocket Integration** - Live candlestick and price updates
- **Responsive Design** - Mobile-friendly layout with TailwindCSS

### 📊 Chart Features

- **Straddle/Strangle Calculations** - Toggle between average and sum methods
- **Multi-timeframe Support** - 1m, 5m, 15m, 1h, 4h, 1d resolutions
- **Professional Charts** - Powered by Lightweight Charts library
- **Real-time Updates** - WebSocket-based live data streaming
- **Dark Mode Support** - Automatic theme detection

### 🎯 User Interface

- **Clean Design** - Modern UI with TailwindCSS
- **Loading States** - Comprehensive loading and error handling
- **Selection Summary** - Visual feedback for chosen options
- **Responsive Layout** - Optimized for desktop and mobile

## 🏗️ Architecture

### Components Structure

```
components/
├── SettlementDateTabs.tsx    # Date selection tabs
├── OptionChainTable.tsx      # Interactive option selection
├── CombinedChart.tsx         # Main straddle/strangle chart
├── BtcChart.tsx             # Bitcoin price chart
└── ChartContainer.tsx       # Layout utilities
```

### Utilities Structure

```
utils/
├── deltaApi.ts             # Delta Exchange API integration
├── websocketClient.ts      # WebSocket connection management
└── chartHelpers.ts         # Data processing & calculations
```

## 🔧 Technical Stack

- **Frontend Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Charts**: Lightweight Charts
- **APIs**: Delta Exchange REST + WebSocket
- **State Management**: React Hooks
- **Build Tool**: Next.js with Turbopack

## 🌐 API Integration

### REST APIs Used

- Settlement Dates: `https://cdn.india.deltaex.org/web/options/info`
- Options Data: `https://api.india.delta.exchange/v2/products`
- Candlestick Data: `https://api.india.delta.exchange/v2/history/candles`
- BTC Price: `https://api.india.delta.exchange/v2/tickers/BTCUSD`

### WebSocket Channels

- `candlestick_1m` - Real-time candlestick updates
- `mark_price` - Live price feeds
- Auto-reconnection and error handling

## 📱 Usage

1. **Landing Page**: Navigate to `/` to see overview with auto-redirect to dashboard
2. **Dashboard**: Access main dashboard at `/delta-straddle-dashboard`
3. **Select Date**: Choose settlement date from available tabs
4. **Select Options**: Click cells in option chain to select calls/puts
5. **View Charts**: Charts update automatically with selected options
6. **Real-time Data**: Charts receive live updates via WebSocket

## 🎨 Key Features Highlights

### Option Chain Table

- **CE Price | Strike | PE Price** layout
- **Clickable cells** for multi-selection
- **Volume indicators** and price information
- **Responsive design** with hover effects

### Combined Chart

- **Straddle visualization** using selected options
- **Average/Sum toggle** for calculation methods
- **Real-time candlestick updates**
- **Professional charting** with crosshair and tooltips

### Bitcoin Chart

- **Underlying price tracking** for market context
- **Same resolution** as options charts
- **Live price updates** and percentage changes
- **24h high/low statistics**

## 🔄 Real-time Features

- **WebSocket Connections** - Automatic reconnection on disconnect
- **Live Data Updates** - Real-time chart updates
- **Connection Status** - Visual indicators for connection state
- **Error Handling** - Graceful fallbacks on API failures

## 🎯 Performance Optimizations

- **Data Caching** - LocalStorage for settlement dates
- **Efficient Updates** - Targeted chart updates via WebSocket
- **Responsive Design** - Optimized for different screen sizes
- **Type Safety** - Full TypeScript coverage

## 🏆 Success Metrics

✅ **Build Success**: Compiles without errors  
✅ **Type Safety**: Full TypeScript implementation  
✅ **API Integration**: All endpoints functional  
✅ **Real-time Data**: WebSocket connections working  
✅ **Responsive Design**: Mobile-friendly layout  
✅ **Error Handling**: Comprehensive error states  

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 📁 Project Structure

The dashboard is built following Next.js best practices with:

- App Router structure
- Component modularity
- Utility separation
- Type safety throughout
- Professional charting integration

---

**Built with**: Next.js 16, TypeScript, TailwindCSS, Lightweight Charts  
**Data Source**: Delta Exchange India API  
**Version**: 1.0.0  

This dashboard provides a professional-grade options analysis tool with real-time capabilities and modern web technologies.
