import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME } from "../config/constants.js";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

class Logger {
  private logFilePath: string;

  constructor() {
    const configDir = app.getPath("userData");
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    this.logFilePath = join(configDir, "app.log");
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const argsString = args.length > 0 ? " " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(" ") : "";
    return `[${timestamp}] [${level}] [${APP_NAME}] ${message}${argsString}`;
  }

  private rotateLogIfNeeded() {
    if (existsSync(this.logFilePath)) {
      const stats = statSync(this.logFilePath);
      if (stats.size > MAX_LOG_SIZE) {
        const rotatedPath = `${this.logFilePath}.1`;
        try {
          renameSync(this.logFilePath, rotatedPath);
        } catch (e) {
          console.error("Failed to rotate log file:", e);
        }
      }
    }
  }

  private write(level: LogLevel, message: string, ...args: unknown[]) {
    const formattedMessage = this.formatMessage(level, message, ...args);
    
    // Terminal output
    switch (level) {
      case "DEBUG":
        console.debug(formattedMessage);
        break;
      case "INFO":
        console.info(formattedMessage);
        break;
      case "WARN":
        console.warn(formattedMessage);
        break;
      case "ERROR":
        console.error(formattedMessage);
        break;
    }

    // File output
    try {
      this.rotateLogIfNeeded();
      appendFileSync(this.logFilePath, formattedMessage + "\n", "utf-8");
    } catch (e) {
      console.error("Failed to write to log file:", e);
    }
  }

  debug(message: string, ...args: unknown[]) {
    this.write("DEBUG", message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.write("INFO", message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.write("WARN", message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.write("ERROR", message, ...args);
  }
}

export const logger = new Logger();
