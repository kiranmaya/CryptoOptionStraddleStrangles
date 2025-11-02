// Delta Exchange Options Straddle/Strangle Dashboard

'use client';

import { useState } from 'react';
import { BtcChart } from '../../components/BtcChart';
import { ChartSection } from '../../components/ChartContainer';
import { CombinedChart } from '../../components/CombinedChart';
import { OptionChainTable, Selection } from '../../components/OptionChainTable';
import { SettlementDateTabs } from '../../components/SettlementDateTabs';
import { CalculationMethod } from '../../utils/chartHelpers';

export default function DeltaStraddleDashboard() {
  // State management
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selections, setSelections] = useState<Selection[]>([]);
  const [calculationMethod, setCalculationMethod] = useState<CalculationMethod>('average');
  const [resolution, setResolution] = useState('1');
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Handle date selection
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    // Clear selections when date changes
    setSelections([]);
  };

  // Handle option selection changes
  const handleSelectionChange = (newSelections: Selection[]) => {
    setSelections(newSelections);
  };

  // Handle calculation method changes
  const handleCalculationMethodChange = (method: CalculationMethod) => {
    setCalculationMethod(method);
  };

  // Handle resolution changes
  const handleResolutionChange = (newResolution: string) => {
    setResolution(newResolution);
  };

  // Export chart as PNG (bonus feature)
  const exportChartAsPng = () => {
    // Implementation would depend on the chart library
    // This is a placeholder for the bonus feature
    alert('Chart export functionality would be implemented here');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Delta Exchange Options Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Real-time options straddle & strangle analysis
              </p>
            </div>
            
            {/* Header Actions */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
              
              <button
                onClick={exportChartAsPng}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                disabled={selections.length === 0}
              >
                Export Chart
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ${isFullscreen ? 'max-w-none px-2' : ''}`}>
        {/* Settlement Date Tabs */}
        <div className="mb-6">
          <SettlementDateTabs
            onDateSelect={handleDateSelect}
            selectedDate={selectedDate}
          />
        </div>

        {/* Main Dashboard Grid */}
        <div className={`${isFullscreen ? 'grid grid-cols-1 xl:grid-cols-3 gap-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}`}>
          {/* Left Column - Option Chain Table */}
          <div className={`${isFullscreen ? 'xl:col-span-1' : 'lg:col-span-1'}`}>
            <ChartSection
              title="Option Chain"
              description="Click cells to select options for straddle/strangle analysis"
              className="h-fit"
            >
              {selectedDate ? (
                <OptionChainTable
                  selectedDate={selectedDate}
                  onSelectionChange={handleSelectionChange}
                />
              ) : (
                <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    <p className="text-gray-600 font-medium">Select a settlement date</p>
                    <p className="text-gray-500 text-sm mt-1">
                      Choose an expiry date above to view available options
                    </p>
                  </div>
                </div>
              )}
            </ChartSection>
          </div>

          {/* Right Column - Charts */}
          <div className={`${isFullscreen ? 'xl:col-span-2' : 'lg:col-span-1'} space-y-6`}>
            {/* Combined Options Chart */}
            <ChartSection
              title="Combined Options Chart"
              description="Straddle/strangle visualization with real-time data"
              headerAction={
                <div className="flex items-center space-x-2">
                  <select
                    value={resolution}
                    onChange={(e) => handleResolutionChange(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white"
                  >
                    <option value="1">1m</option>
                    <option value="3">3m</option>
                    <option value="5">5m</option>
                    <option value="15">15m</option>
                    <option value="30">30m</option>
                  </select>
                </div>
              }
            >
              <CombinedChart
                selections={selections}
                calculationMethod={calculationMethod}
                resolution={resolution}
                onCalculationChange={handleCalculationMethodChange}
              />
            </ChartSection>

            {/* BTC Price Chart */}
            <ChartSection
              title="Bitcoin Price Chart"
              description="Underlying asset price tracking"
            >
              <BtcChart
                resolution={resolution}
                onResolutionChange={handleResolutionChange}
              />
            </ChartSection>
          </div>
        </div>

        {/* Selection Summary Panel */}
        {selections.length > 0 && (
          <div className="mt-6">
            <ChartSection
              title="Selection Summary"
              description="Current options selection for analysis"
              className="max-w-2xl"
            >
              <div className="space-y-4">
                {/* Selected Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Selected Calls</h4>
                    <div className="space-y-2">
                      {selections
                        .filter(s => s.type === 'call')
                        .map((selection, index) => (
                          <div key={`call-${index}`} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
                            <span className="text-sm font-mono text-green-800">{selection.symbol}</span>
                            <span className="text-sm text-green-600">${selection.price || 'N/A'}</span>
                          </div>
                        ))}
                      {selections.filter(s => s.type === 'call').length === 0 && (
                        <p className="text-sm text-gray-500 italic">No call options selected</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Selected Puts</h4>
                    <div className="space-y-2">
                      {selections
                        .filter(s => s.type === 'put')
                        .map((selection, index) => (
                          <div key={`put-${index}`} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-200">
                            <span className="text-sm font-mono text-red-800">{selection.symbol}</span>
                            <span className="text-sm text-red-600">${selection.price || 'N/A'}</span>
                          </div>
                        ))}
                      {selections.filter(s => s.type === 'put').length === 0 && (
                        <p className="text-sm text-gray-500 italic">No put options selected</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Analysis Info */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    <span>Calculation Method: </span>
                    <span className="font-medium capitalize">{calculationMethod}</span>
                    <span className="ml-4">Resolution: {resolution}m</span>
                  </div>
                  <button
                    onClick={() => setSelections([])}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </ChartSection>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              <p>Delta Exchange Options Dashboard</p>
              <p className="mt-1">
                Real-time data from{' '}
                <a
                  href="https://www.delta.exchange"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  delta.exchange
                </a>
              </p>
            </div>
            <div className="text-right">
              <p>Built with Next.js, TypeScript & Lightweight Charts</p>
              <p className="mt-1">Version 1.0.0</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}