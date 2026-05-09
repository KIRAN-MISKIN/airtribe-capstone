function responseTime(req, res, next) {
  const start = process.hrtime.bigint();
  
  const originalEnd = res.end;
  res.end = function(...args) {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    res.setHeader('x-response-time', `${ms.toFixed(2)}ms`);
    return originalEnd.apply(res, args);
  };
  
  next();
}

module.exports = { responseTime };

