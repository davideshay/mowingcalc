import pino from 'pino';
import { WebSocket } from 'ws';

const logger = pino({ level: 'info' });

interface PendingRequest {
  resolve: (value: {[key: string]: any}) => void;
  reject: (reason: any) => void;
  timeoutId: NodeJS.Timeout;
}

export class HAWsConnection {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private token: string;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private connected = false;
  private connecting = false;
  private connectPromise: Promise<void> | null = null;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private get wsUrl(): string {
    const protocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    return `${protocol}://${this.baseUrl.replace(/^https?:\/\//, '')}/api/websocket`;
  }

  // Connect and authenticate. Resolves when auth_ok is received.
  // Safe to call multiple times - returns same promise if already connecting.
  private async connect(): Promise<void> {
    // If already connected or connecting, wait for existing connection
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect();
    return this.connectPromise;
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close old connection if it exists
      if (this.ws) {
        this.ws.removeAllListeners();
        try {
          this.ws.close();
        } catch {
          // Ignore
        }
        this.ws = null;
      }

      this.connecting = true;
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        logger.info({ url: this.wsUrl }, 'WebSocket connected, authenticating');
        this.ws!.send(JSON.stringify({ type: 'auth', access_token: this.token }));
      });

      this.ws.on('message', (data: Buffer) => {
        let parsed: {[key: string]: any};
        try {
          parsed = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Auth response
        if (!this.connected) {
          if (parsed.type === 'auth_ok') {
            this.connected = true;
            this.connecting = false;
            logger.info('WebSocket authenticated');
            resolve();
            return;
          }
          if (parsed.type === 'auth_invalid') {
            this.connecting = false;
            this.connectPromise = null;
            const err = new Error(`WS auth invalid: ${parsed.message}`);
            reject(err);
            return;
          }
          if (parsed.type === 'auth_required') {
            // First message, ignore
            return;
          }
        }

        // Route response to pending request by id
        if (parsed.id) {
          const pending = this.pending.get(parsed.id);
          if (pending) {
            this.pending.delete(parsed.id);
            clearTimeout(pending.timeoutId);
            if (parsed.type === 'error') {
              pending.reject(new Error(`HA WS error: ${parsed.error?.code} ${parsed.error?.message}`));
            } else {
              pending.resolve(parsed);
            }
          }
        }
      });

      this.ws.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'WebSocket error');
        if (!this.connected) {
          this.connecting = false;
          this.connectPromise = null;
          reject(err);
        }
        // Don't let WebSocket errors crash the process
        return false;
      });

      this.ws.on('close', (code) => {
        logger.warn({ code }, 'WebSocket closed');
        this.connected = false;
        // Reject all pending requests
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timeoutId);
          pending.reject(new Error(`WebSocket closed (code ${code})`));
          this.pending.delete(id);
        }
        if (!this.connected) {
          this.connecting = false;
          this.connectPromise = null;
        }
      });

      // Keep the WebSocket from crashing the process
      this.ws.setMaxListeners(20);

      // Connection timeout
      setTimeout(() => {
        if (!this.connected) {
          this.connecting = false;
          this.connectPromise = null;
          this.ws?.close();
          reject(new Error('WebSocket connection timed out'));
        }
      }, 10000);
    });
  }

  // Ensure we have an open connection. If already connecting, waits for that.
  private async ensureConnected(): Promise<void> {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }
    // Not connected - start/connect
    await this.connect();
  }

  // Send a message and wait for the matching response.
  // Multiple calls can be made concurrently - each gets a unique id.
  async send(msg: {[key: string]: any}): Promise<{[key: string]: any}> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      msg.id = id;

      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`WebSocket request timed out (30s)`));
      }, 30000);

      this.pending.set(id, { resolve, reject, timeoutId });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  // Fetch statistics for a single entity
  async getStatistics(
    entityId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<Array<{[key: string]: any}>> {
    logger.info({ entityId, startTime: startTime.toISOString(), endTime: endTime.toISOString() }, 'Fetching statistics via WebSocket');

    const result = await this.send({
      type: 'recorder/statistics_during_period',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      statistic_ids: [entityId],
      period: '5minute',
    });

    const resultDict = result.result as {[key: string]: Array<{[key: string]: any}>} | undefined;
    if (!resultDict) {
      logger.debug({ entityId }, 'No result dict from WebSocket');
      return [];
    }

    const stats = resultDict[entityId];
    if (!stats || stats.length === 0) {
      logger.debug({ entityId }, 'No statistics from WebSocket for entity');
      return [];
    }

    logger.info({ entityId, count: stats.length }, 'Received statistics from WebSocket');
    return stats;
  }

  // Fetch statistics for ALL entities concurrently over the same connection
  // Uses a SINGLE connection and sends requests sequentially (one at a time)
  // to avoid overwhelming the connection with concurrent sends.
  async getStatisticsBatch(
    entityIds: string[],
    startTime: Date,
    endTime: Date,
  ): Promise<Map<string, Array<{[key: string]: any}>>> {
    logger.info({ entityCount: entityIds.length, startTime: startTime.toISOString(), endTime: endTime.toISOString() }, 'Fetching batch statistics via WebSocket');

    // Send requests sequentially over the single connection
    // Each request gets its own unique ID and waits for the response
    const resultMap = new Map<string, Array<{[key: string]: any}>>();

    for (const entityId of entityIds) {
      try {
        const stats = await this.getStatistics(entityId, startTime, endTime);
        resultMap.set(entityId, stats);
      } catch (err) {
        logger.warn({ entityId, err }, 'Failed to fetch statistics for entity');
        resultMap.set(entityId, []);
      }
    }

    return resultMap;
  }

  // Close the connection
  close(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.connecting = false;
      this.connectPromise = null;
    }
  }
}
