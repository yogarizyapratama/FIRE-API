import { describe, expect, it } from 'bun:test';
import { WebSocketHub, MockWebSocket } from '../src/ws/ws';

describe('FireAPI Native WebSockets with Rooms & Pub/Sub', () => {
  it('manages rooms, joining, leaving, and publishing messages', () => {
    const hub = new WebSocketHub();

    const client1 = new MockWebSocket('ws_1');
    const client2 = new MockWebSocket('ws_2');
    const client3 = new MockWebSocket('ws_3');

    const fireWs1 = hub.register(client1);
    const fireWs2 = hub.register(client2);
    const fireWs3 = hub.register(client3);

    // Client 1 and 2 join room "chat:tech"
    fireWs1.join('chat:tech');
    fireWs2.join('chat:tech');

    // Client 3 joins room "chat:random"
    fireWs3.join('chat:random');

    // Client 1 publishes message to "chat:tech"
    fireWs1.publish('chat:tech', { user: 'Alice', text: 'Hello tech!' });

    // Client 2 should receive the message
    expect(client2.receivedMessages.length).toBe(1);
    expect(JSON.parse(client2.receivedMessages[0])).toEqual({ user: 'Alice', text: 'Hello tech!' });

    // Client 3 in another room should NOT receive it
    expect(client3.receivedMessages.length).toBe(0);

    // Client 2 leaves the room
    fireWs2.leave('chat:tech');

    // Client 1 publishes again
    fireWs1.publish('chat:tech', { user: 'Alice', text: 'Anyone here?' });
    expect(client2.receivedMessages.length).toBe(1); // Still 1, didn't receive second
  });

  it('broadcasts messages to all connected clients globally', () => {
    const hub = new WebSocketHub();
    const c1 = new MockWebSocket('c1');
    const c2 = new MockWebSocket('c2');

    const ws1 = hub.register(c1);
    hub.register(c2);

    ws1.broadcast({ announcement: 'System update in 5 mins' });

    expect(c1.receivedMessages.length).toBe(1);
    expect(c2.receivedMessages.length).toBe(1);
  });
});
