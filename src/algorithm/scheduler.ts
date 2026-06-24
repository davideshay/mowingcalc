import pino from 'pino';
import { DecisionEngine } from './decision-engine';

const logger = pino({ level: 'info' });

export class AlgorithmScheduler {
  private engine: DecisionEngine;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(engine: DecisionEngine) {
    this.engine = engine;
  }

  public start(intervalMinutes: number): void {
    if (this.running) return;
    this.running = true;

    logger.info({ intervalMinutes }, 'Starting algorithm scheduler');

    // Run immediately on start
    this.runOnce();

    // Then schedule recurring runs
    this.timer = setInterval(() => {
      this.runOnce();
    }, intervalMinutes * 60 * 1000);
  }

  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Algorithm scheduler stopped');
  }

  public async runOnce(): Promise<void> {
    try {
      logger.info('Running algorithm decision engine');
      const result = await this.engine.run();

      // Write to HA input helpers if enabled (informational - not blocked by readonly mode)
      await this.engine.writeToHAHelpers(result);

      if (result.should_mow) {
        if (this.engine['config'].readonlyMode) {
          logger.info({ reason: result.reason }, 'ALGORITHM DECISION: mow recommended but READONLY MODE - mower NOT triggered');
        } else {
          logger.info({ reason: result.reason }, 'ALGORITHM DECISION: MOW NOW');
          await this.engine.triggerMower();
        }
      } else {
        logger.info({
          reason: result.reason,
          next_review: result.next_review_time.toISOString(),
        }, 'ALGORITHM DECISION: wait');
      }
    } catch (err) {
      logger.error({ err }, 'Algorithm run failed');
    }
  }
}
