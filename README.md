# Crypto Options Straddle & Strangle Dashboard

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Site-blue?style=for-the-badge)](https://crypto-option-straddle-strangles.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-14.0-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

A real-time financial dashboard for analyzing Bitcoin options trading strategies, specifically focused on **straddle** and **strangle** strategies using data from Delta Exchange.

## 🚀 Live Demo

**[View Live Dashboard →](https://crypto-option-straddle-strangles.vercel.app/)**

## 📊 Features

### Core Trading Features

- **Real-time Options Data**: Live Bitcoin options chain data from Delta Exchange
- **Straddle/Strangle Analysis**: Visual analysis tools for options trading strategies
- **Interactive Option Selection**: Click-to-select options from the chain table
- **Multiple Settlement Dates**: Support for various expiration dates
- **Calculation Methods**: Switch between average and sum calculations
- **Time Resolution Controls**: Multiple timeframe resolutions (1m, 3m, 5m, 15m, 30m)

### Advanced Charting

- **Dual-Pane Charts**: Synchronized options and Bitcoin price visualization
- **Candlestick Visualization**: Professional financial charting with Lightweight Charts
- **Real-time Updates**: WebSocket-based live data streaming
- **Cross-Correlation Analysis**: Compare options performance with underlying BTC price
- **Responsive Design**: Full-screen and compact view modes

### Technical Features

- **WebSocket Integration**: Real-time data streaming for live trading insights
- **Data Caching**: Optimized performance with intelligent caching
- **Error Handling**: Robust error handling with fallback mechanisms
- **TypeScript**: Full type safety throughout the application
- **Responsive UI**: Mobile-friendly design with Tailwind CSS

## 🛠️ Technology Stack

- **[Next.js 14](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[React](https://reactjs.org/)** - User interface library
- **[Lightweight Charts](https://tradingview.github.io/lightweight-charts/)** - Professional financial charts
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Delta Exchange API](https://www.delta.exchange/)** - Options trading data source
- **[WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)** - Real-time data streaming

## 📁 Project Structure

```
├── app/
│   ├── delta-straddle-dashboard/
│   │   └── page.tsx                 # Main dashboard page
│   ├── layout.tsx                   # Root layout
│   └── page.tsx                     # Home page
├── components/
│   ├── BtcChart.tsx                 # Bitcoin price chart
│   ├── ChartContainer.tsx           # Reusable chart container
│   ├── CombinedChart.tsx           # Options + BTC combined chart
│   ├── OptionChainTable.tsx         # Interactive options table
│   └── SettlementDateTabs.tsx       # Settlement date selector
├── utils/
│   ├── chartHelpers.ts              # Chart data processing utilities
│   ├── deltaApi.ts                  # Delta Exchange API integration
│   └── websocketClient.ts           # WebSocket connection management
├── public/                          # Static assets
└── docs/                           # API documentation and design files
```

## 🔧 Installation & Setup

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm package manager

### Local Development

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd crypto-option-straddle-strangles
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
npm start
```

## 🎯 How It Works

### Options Trading Strategies

**Straddle Strategy**: Buying both a call and put option at the same strike price, betting on significant price movement in either direction.

**Strangle Strategy**: Buying a call and put option at different strike prices, typically used when expecting volatility but uncertain of direction.

### Dashboard Workflow

1. **Select Settlement Date**: Choose your desired expiration date from available options
2. **Analyze Option Chain**: View available call and put options with strike prices
3. **Select Options**: Click on option cells to include them in your analysis
4. **Visualize Strategy**: View combined options data alongside Bitcoin price
5. **Real-time Monitoring**: Track live price movements and strategy performance

## 🔌 API Integration

### Delta Exchange Endpoints Used

- **Options Info**: `https://cdn.india.deltaex.org/web/options/info`
- **Products**: `https://api.india.delta.exchange/v2/products`
- **Candlesticks**: `https://api.india.delta.exchange/v2/history/candles`
- **Tickers**: `https://api.india.delta.exchange/v2/tickers`

### Real-time Data

- **WebSocket Connection**: Live streaming of price updates
- **Candlestick Updates**: Real-time OHLCV data for selected options
- **Price Feeds**: Live mark prices for BTC and selected options

## 📱 User Interface

### Main Dashboard Layout

```
┌─────────────────────────────────────────────┐
│                Header                       │
│  Delta Exchange Options Dashboard          │
│  Real-time straddle & strangle analysis    │
└─────────────────────────────────────────────┘

┌──────────────┬──────────────────────────────┐
│   Option     │         Charts               │
│   Chain      │                              │
│              │  ┌─────────────────────────┐ │
│   [Select]   │  │  Combined Options Chart │ │
│   [Dates]    │  │  + BTC Price            │ │
│              │  └─────────────────────────┘ │
│              │                              │
│              │  ┌─────────────────────────┐ │
│              │  │    BTC Price Chart      │ │
│              │  └─────────────────────────┘ │
└──────────────┴──────────────────────────────┘
```

## 🚀 Key Components

### CombinedChart Component

- **Purpose**: Visualizes combined options data with Bitcoin price
- **Features**: Dual-pane layout, real-time updates, multiple resolutions
- **Dependencies**: Lightweight Charts library

### OptionChainTable Component  

- **Purpose**: Interactive table for selecting options
- **Features**: Click-to-select, strike price sorting, call/put separation
- **Data Source**: Delta Exchange products API

### SettlementDateTabs Component

- **Purpose**: Date selection interface
- **Features**: Tabbed navigation, date formatting
- **Data Source**: Delta Exchange options info API

## 🔒 Data Sources

- **Primary**: [Delta Exchange](https://www.delta.exchange/) - Indian cryptocurrency derivatives exchange
- **BTC Price**: Real-time Bitcoin price feeds
- **Options Data**: Historical and live options candlestick data
- **Market Info**: Settlement dates, strike prices, contract specifications

## 📊 Chart Types

- **Combined Options Chart**: Aggregated options performance
- **Bitcoin Price Chart**: Underlying asset price movement
- **Candlestick Charts**: OHLC (Open, High, Low, Close) visualization
- **Real-time Updates**: Live price streaming with WebSocket

## 🎨 Design Philosophy

- **Professional Trading Interface**: Clean, minimal design focused on data clarity
- **Responsive Layout**: Works seamlessly on desktop and mobile devices
- **Real-time Feedback**: Immediate visual responses to user interactions
- **Performance Optimized**: Efficient data handling and rendering
- **Accessibility**: Screen reader friendly with proper ARIA labels

## 🧪 Development

### Code Style

- **TypeScript**: Strict type checking enabled
- **ESLint + Prettier**: Code linting and formatting
- **Component Structure**: Modular, reusable React components
- **Error Boundaries**: Comprehensive error handling

### Performance Considerations

- **Data Caching**: Intelligent caching for API responses
- **WebSocket Management**: Efficient connection handling
- **Chart Optimization**: Smooth rendering with large datasets
- **Bundle Optimization**: Code splitting and lazy loading

## 📈 Future Enhancements

- [ ] Additional cryptocurrency support (ETH, SOL)
- [ ] Options Greeks calculation and visualization
- [ ] Strategy backtesting capabilities
- [ ] Portfolio tracking and P&L analysis
- [ ] Alert system for price levels
- [ ] Export functionality for charts and data
- [ ] Advanced technical indicators
- [ ] Multi-timeframe analysis

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🔗 Useful Links

- **Delta Exchange**: [https://www.delta.exchange/](https://www.delta.exchange/)
- **Live Dashboard**: [https://crypto-option-straddle-strangles.vercel.app/](https://crypto-option-straddle-strangles.vercel.app/)
- **API Documentation**: See `/docs` folder for detailed API reference
- **TradingView Lightweight Charts**: [https://tradingview.github.io/lightweight-charts/](https://tradingview.github.io/lightweight-charts/)

---

**Disclaimer**: This dashboard is for educational and analytical purposes only. It does not constitute financial advice. Always conduct your own research and consult with financial professionals before making trading decisions.
