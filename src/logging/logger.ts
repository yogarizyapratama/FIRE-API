export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  time: number;
  reqId?: string;
  msg: string;
  [key: string]: any;
}

export class FireLogger {
  private customSink?: (record: LogRecord) => void;

  constructor(private contextReqId?: string) {}

  public setSink(sink: (record: LogRecord) => void): void {
    this.customSink = sink;
  }

  private emitLog(level: LogLevel, msg: string, data?: Record<string, any>): LogRecord {
    const record: LogRecord = {
      level,
      time: Date.now(),
      ...(this.contextReqId ? { reqId: this.contextReqId } : {}),
      msg,
      ...(data || {}),
    };

    if (this.customSink) {
      this.customSink(record);
    } else {
      const line = JSON.stringify(record);
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
    }

    return record;
  }

  public debug(msg: string, data?: Record<string, any>): LogRecord {
    return this.emitLog('debug', msg, data);
  }

  public info(msg: string, data?: Record<string, any>): LogRecord {
    return this.emitLog('info', msg, data);
  }

  public warn(msg: string, data?: Record<string, any>): LogRecord {
    return this.emitLog('warn', msg, data);
  }

  public error(msg: string, data?: Record<string, any>): LogRecord {
    return this.emitLog('error', msg, data);
  }

  public child(reqId: string): FireLogger {
    const logger = new FireLogger(reqId);
    if (this.customSink) logger.setSink(this.customSink);
    return logger;
  }
}
