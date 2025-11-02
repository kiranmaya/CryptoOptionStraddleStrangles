'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Redirect to dashboard after a short delay
    const timer = setTimeout(() => {
      window.location.href = '/delta-straddle-dashboard';
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <main className="text-center max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Delta Exchange Options Dashboard
            </h1>
            <p className="text-lg text-gray-600 mb-6">
              Real-time options straddle & strangle analysis with Bitcoin price tracking
            </p>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">📊 Dynamic Data</h3>
                <p className="text-blue-700">Live settlement dates, option chains, and real-time price feeds</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">📈 Straddle/Strangle</h3>
                <p className="text-green-700">Combined option charts with average and sum calculations</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-900 mb-2">₿ BTC Tracking</h3>
                <p className="text-purple-700">Underlying Bitcoin price chart for market context</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600">Loading dashboard...</p>
            
            <div className="pt-4">
              <Link
                href="/delta-straddle-dashboard"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
                <svg className="ml-2 w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
            <p>Built with Next.js, TypeScript, and Lightweight Charts</p>
            <p className="mt-1">Data from Delta Exchange India API</p>
          </div>
        </div>
      </main>
    </div>
  );
}
