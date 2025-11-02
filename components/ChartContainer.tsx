// Chart Container Component for Layout Management

import { ReactNode } from 'react';

interface ChartContainerProps {
  children: ReactNode;
  className?: string;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  );
};

interface ChartGridProps {
  children: ReactNode;
  className?: string;
}

export const ChartGrid: React.FC<ChartGridProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${className}`}>
      {children}
    </div>
  );
};

interface ChartSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}

export const ChartSection: React.FC<ChartSectionProps> = ({
  title,
  description,
  children,
  className = '',
  headerAction
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {description && (
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            )}
          </div>
          {headerAction && (
            <div className="shrink-0">
              {headerAction}
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
};

interface ControlPanelProps {
  children: ReactNode;
  className?: string;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Controls</h3>
      {children}
    </div>
  );
};

interface StatsPanelProps {
  children: ReactNode;
  className?: string;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Statistics</h3>
      {children}
    </div>
  );
};

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]} ${className}`}></div>
  );
};

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  className = ''
}) => {
  return (
    <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <div className="flex items-center">
        <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
        <span className="text-red-700">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      )}
    </div>
  );
};

interface StatusIndicatorProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  message: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  message,
  className = ''
}) => {
  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    connecting: 'bg-yellow-500',
    error: 'bg-red-500'
  };

  const statusAnimations = {
    connected: '',
    disconnected: '',
    connecting: 'animate-pulse',
    error: 'animate-pulse'
  };

  return (
    <div className={`flex items-center ${className}`}>
      <div className={`w-2 h-2 rounded-full mr-2 ${statusColors[status]} ${statusAnimations[status]}`}></div>
      <span className="text-xs text-gray-600">{message}</span>
    </div>
  );
};

interface ResponsiveProps {
  children: ReactNode;
  className?: string;
}

export const MobileHidden: React.FC<ResponsiveProps> = ({ children, className = '' }) => {
  return (
    <div className={`hidden md:block ${className}`}>
      {children}
    </div>
  );
};

export const DesktopHidden: React.FC<ResponsiveProps> = ({ children, className = '' }) => {
  return (
    <div className={`block md:hidden ${className}`}>
      {children}
    </div>
  );
};