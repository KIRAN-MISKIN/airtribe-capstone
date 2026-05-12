const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;

const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
  if (metadata.isRequestLog) {
    const { method, originalUrl, ms, query, params, body, status, resBody } = metadata;
    const isError = status >= 400;
    const color = isError ? "\x1b[31m" : "\x1b[36m"; // Red for error, Cyan for success
    const reset = "\x1b[0m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";

    let box = `${color}┌──────────────────────────────────────────────────────────┐${reset}\n`;
    box += `${color}│${reset} ${bold}${method}${reset} ${originalUrl} ${dim}(${ms.toFixed(2)}ms)${reset}\n`;
    box += `${color}├────────────────────── REQUEST INPUT ─────────────────────┤${reset}\n`;
    
    if (query && Object.keys(query).length) box += `${color}│${reset} Query: ${JSON.stringify(query)}\n`;
    if (params && Object.keys(params).length) box += `${color}│${reset} Params: ${JSON.stringify(params)}\n`;
    if (body && Object.keys(body).length) {
      const bStr = JSON.stringify(body);
      box += `${color}│${reset} Body: ${bStr.length > 500 ? bStr.substring(0, 500) + '...' : bStr}\n`;
    }
    
    box += `${color}├───────────────────── RESPONSE OUTPUT ────────────────────┤${reset}\n`;
    box += `${color}│${reset} Status: ${isError ? '\x1b[31m' : '\x1b[32m'}${status}${reset}\n`;
    if (resBody !== undefined) {
      const rbStr = JSON.stringify(resBody);
      box += `${color}│${reset} Body: ${rbStr.length > 500 ? rbStr.substring(0, 500) + '...' : rbStr}\n`;
    }
    box += `${color}└──────────────────────────────────────────────────────────┘${reset}`;

    return `\n[${timestamp}] ${level} - API REQUEST:\n${box}\n`;
  }

  // Regular log format
  let msg = `[${timestamp}] ${level}: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += `\n  ${JSON.stringify(metadata, null, 2)}`;
  }
  return msg;
});

const winstonLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [new transports.Console()],
});

const normalizeArgs = (a, b) => {
  if (typeof a === 'string') return [{}, a];
  return [a || {}, b];
};

const logger = {
  error: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return winstonLogger.error(msg || '', obj);
  },
  warn: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return winstonLogger.warn(msg || '', obj);
  },
  info: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return winstonLogger.info(msg || '', obj);
  },
  debug: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return winstonLogger.debug(msg || '', obj);
  },
};

module.exports = { logger };

