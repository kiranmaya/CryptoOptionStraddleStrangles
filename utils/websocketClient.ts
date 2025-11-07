// WebSocket client for Delta Exchange real-time data

export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

export interface CandlestickUpdate {
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

type MessageHandler = (data: unknown) => void;

class DeltaWebSocketClient {
  private ws: WebSocket | null = null;
  private url = 'wss://socket.india.delta.exchange';
  private reconnectInterval = 5000;
  private maxReconnectAttempts = 10;
  private reconnectAttempts = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private subscribedSymbols = new Set<string>();
  private messageHandlers = new Map<string, MessageHandler[]>();
  private isConnecting = false;
  private isReconnecting = false;
  private apiKey?: string;
  private apiSecret?: string;
  private isAuthenticated = false;

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    console.log('Connecting to Delta WebSocket...');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('Connected to Delta WebSocket');
        this.isConnecting = false;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Resubscribe to existing symbols
        this.resubscribeSymbols();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        this.isConnecting = false;
        this.ws = null;
        
        // Stop heartbeat
        this.stopHeartbeat();
        
        // Attempt reconnection
        if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${this.reconnectInterval}ms`);
    
    setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000); // Send ping every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private resubscribeSymbols(): void {
    if (this.subscribedSymbols.size > 0) {
      const symbols = Array.from(this.subscribedSymbols);
      this.subscribeCandlesticks(symbols);
      this.subscribeTickers(symbols);
    }
  }

  private handleMessage(data: unknown): void {
    const message = data as WebSocketMessage;
    
    console.log('Received WebSocket message:', message);
    
    // Handle different message types
    switch (message.type) {
      case 'pong':
        // Handle pong response
        break;
      case 'candlestick_1m':
      case 'candlestick_5m':
      case 'candlestick_15m':
        this.handleCandlestickUpdate(message);
        break;
      case 'v2/ticker':
        this.handleTickerUpdate(message);
        break;
      case 'subscription':
        console.log('Subscription confirmed:', message.payload);
        break;
      case 'key-auth':
        if (message.payload && typeof message.payload === 'object') {
          const payload = message.payload as { success?: boolean; status_code?: number; status?: string };
          if (payload.success) {
            this.isAuthenticated = true;
            console.log('WebSocket authentication successful:', payload.status);
            this.resubscribeSymbols();
          } else {
            console.error('WebSocket authentication failed:', payload.status, payload);
          }
        } else {
          console.error('WebSocket authentication failed:', message.payload);
        }
        break;
      default:
        console.log('Unhandled message type:', message.type, message.payload);
    }

    // Notify registered handlers for specific message types
    const handlers = this.messageHandlers.get(message.type) || [];
    handlers.forEach(handler => handler(message.payload));
  }

  private handleCandlestickUpdate(message: WebSocketMessage): void {
    if (!message.payload) return;
    
    // Extract candlestick data from payload
    const payload = message.payload as Record<string, unknown>;
    const symbol = String(payload.symbol);
    const candle = payload.candle as Record<string, unknown>;
    
    if (candle) {
      const update: CandlestickUpdate = {
        symbol,
        time: Number(candle.time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: candle.volume ? Number(candle.volume) : undefined
      };
      
      // Notify candlestick handlers
      const handlers = this.messageHandlers.get('candlestick') || [];
      handlers.forEach(handler => handler(update));
    }
  }

  private handleTickerUpdate(message: WebSocketMessage): void {
    if (!message.payload) return;
    
    // Handle different ticker payload structures
    const payload = message.payload as Record<string, unknown>;
    
    // Delta Exchange ticker format
    if (payload.symbol && payload.last_price) {
      const symbol = String(payload.symbol);
      const price = Number(payload.last_price);
      
      const update: PriceUpdate = {
        symbol,
        price,
        timestamp: Date.now()
      };
      
      // Notify ticker handlers
      const handlers = this.messageHandlers.get('ticker') || [];
      handlers.forEach(handler => handler(update));
      
      // Also notify mark_price handlers for backward compatibility
      const markPriceHandlers = this.messageHandlers.get('mark_price') || [];
      markPriceHandlers.forEach(handler => handler(update));
      
      // Notify ticker handlers for v2/ticker channel
      const tickerHandlers = this.messageHandlers.get('ticker') || [];
      tickerHandlers.forEach(handler => handler(update));
    }
  }

  private handlePriceUpdate(message: WebSocketMessage): void {
    if (!message.payload) return;
    
    const payload = message.payload as Record<string, unknown>;
    const symbol = String(payload.symbol);
    const price = Number(payload.price);
    
    const update: PriceUpdate = {
      symbol,
      price,
      timestamp: Date.now()
    };
    
    // Notify price handlers
    const handlers = this.messageHandlers.get('price') || [];
    handlers.forEach(handler => handler(update));
  }

  public send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  public subscribeCandlesticks(symbols: string[], resolution: string = '1m'): void {
    symbols.forEach(symbol => this.subscribedSymbols.add(symbol));
    
    this.send({
      type: 'subscribe',
      payload: {
        channels: symbols.map(symbol => ({
          name: `candlestick_${resolution}`,
          symbols: [symbol]
        }))
      }
    });
  }

  public subscribeMarkPrices(symbols: string[]): void {
    this.send({
      type: 'subscribe',
      payload: {
        channels: [{
          name: 'mark_price',
          symbols: symbols
        }]
      }
    });
  }

  public subscribeTickers(symbols: string[]): void {
    console.log('Subscribing to ticker symbols:', symbols);
    this.send({
      type: 'subscribe',
      payload: {
        channels: [{
          name: 'v2/ticker',
          symbols: symbols
        }]
      }
    });
  }

  public authenticate(apiKey: string, apiSecret: string): void {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendAuthMessage();
    }
  }

  private sendAuthMessage(): void {
    if (!this.apiKey || !this.apiSecret) {
      console.error('API key and secret are required for authentication');
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const message = `GET${timestamp}/live`;
    
    // Generate signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.apiSecret);
    const messageData = encoder.encode(message);
    
    // Use Web Crypto API for HMAC-SHA256
    crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ).then(key => {
      return crypto.subtle.sign('HMAC', key, messageData);
    }).then(signature => {
      const hashArray = Array.from(new Uint8Array(signature));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      this.send({
        type: 'key-auth',
        payload: {
          'api-key': this.apiKey,
          signature: hashHex,
          timestamp: timestamp
        }
      });
    }).catch(error => {
      console.error('Error generating signature:', error);
    });
  }

  public unsubscribeCandlesticks(symbols: string[], resolution: string = '1m'): void {
    symbols.forEach(symbol => this.subscribedSymbols.delete(symbol));
    
    this.send({
      type: 'unsubscribe',
      payload: {
        channels: symbols.map(symbol => ({
          name: `candlestick_${resolution}`,
          symbols: [symbol]
        }))
      }
    });
  }

  public on(messageType: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType) || [];
    handlers.push(handler);
    this.messageHandlers.set(messageType, handlers);
  }

  public off(messageType: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      this.messageHandlers.set(messageType, handlers);
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.subscribedSymbols.clear();
    this.messageHandlers.clear();
  }

  public getConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getAuthenticated(): boolean {
    return this.isAuthenticated;
  }
}

// Create singleton instance
export const deltaWebSocket = new DeltaWebSocketClient();

// React hook for using WebSocket in components
import { useCallback, useEffect, useRef, useState } from 'react';

export const useDeltaWebSocket = () => {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map());

  useEffect(() => {
    const checkConnection = () => {
      setConnected(deltaWebSocket.getConnected());
    };

    checkConnection();
    const interval = setInterval(checkConnection, 1000);

    return () => clearInterval(interval);
  }, []);

  // Stable wrappers to avoid changing references across renders
  const subscribeCandlesticks = useCallback((symbols: string[], resolution: string = '1m') => {
    deltaWebSocket.subscribeCandlesticks(symbols, resolution);
  }, []);

  const subscribeTickers = useCallback((symbols: string[]) => {
    deltaWebSocket.subscribeTickers(symbols);
  }, []);

  const subscribeMarkPrices = useCallback((symbols: string[]) => {
    deltaWebSocket.subscribeMarkPrices(symbols);
  }, []);

  const onMessage = useCallback((messageType: string, handler: MessageHandler) => {
    deltaWebSocket.on(messageType, handler);

    // Store handler reference for cleanup
    const handlers = handlersRef.current.get(messageType) || [];
    handlers.push(handler);
    handlersRef.current.set(messageType, handlers);
  }, []);

  const offMessage = useCallback((messageType: string, handler: MessageHandler) => {
    deltaWebSocket.off(messageType, handler);

    // Clean up handler reference
    const handlers = handlersRef.current.get(messageType) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      handlersRef.current.set(messageType, handlers);
    }
  }, []);

  useEffect(() => {
    // Cleanup handlers on unmount
    return () => {
      handlersRef.current.forEach((handlers, messageType) => {
        handlers.forEach(handler => {
          deltaWebSocket.off(messageType, handler);
        });
      });
      handlersRef.current.clear();
    };
  }, []);

  return {
    connected,
    subscribeCandlesticks,
    subscribeTickers,
    subscribeMarkPrices,
    onMessage,
    offMessage
  };
};