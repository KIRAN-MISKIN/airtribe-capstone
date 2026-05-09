const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const level = levels[process.env.LOG_LEVEL] ?? 2;

const base = () => ({ ts: new Date().toISOString() });

const write = (lvl, obj, msg) => {
  if (levels[lvl] > level) return;
  const payload = { level: lvl, ...base(), ...(obj || {}), msg };
  const line = JSON.stringify(payload);
  if (lvl === 'error') return console.error(line);
  if (lvl === 'warn') return console.warn(line);
  return console.log(line);
};

const normalizeArgs = (a, b) => {
  if (typeof a === 'string') return [{}, a];
  return [a || {}, b];
};

const logger = {
  error: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return write('error', obj, msg);
  },
  warn: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return write('warn', obj, msg);
  },
  info: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return write('info', obj, msg);
  },
  debug: (a, b) => {
    const [obj, msg] = normalizeArgs(a, b);
    return write('debug', obj, msg);
  },
};

module.exports = { logger };

