import WebSocket from 'ws';

export type SocketEvent = 'open' | 'message' | 'close' | 'error';

export interface LiveSocket {
  on(event: SocketEvent, listener: (data?: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => LiveSocket;

export const createNodeSocket: SocketFactory = (url) => {
  const socket = new WebSocket(url);
  return {
    on(event, listener) {
      socket.on(event, (data: unknown) => listener(event === 'message' ? String(data) : undefined));
    },
    send: (data) => socket.send(data),
    close: () => socket.close(),
  };
};
