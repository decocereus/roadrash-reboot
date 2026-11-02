export interface SendBudget {
  readonly capped: () => boolean;
  readonly spent: () => number;
}

export const capWebSocketSends = (most: number): SendBudget => {
  let spent = 0;
  let capped = false;
  class CappedSocket extends globalThis.WebSocket {
    override send(data: Parameters<WebSocket["send"]>[0]): void {
      if (spent >= most) {
        capped = true;
        return;
      }
      spent += 1;
      super.send(data);
    }
  }
  globalThis.WebSocket = CappedSocket;
  return { capped: () => capped, spent: () => spent };
};
