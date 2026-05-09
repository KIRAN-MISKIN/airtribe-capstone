const { v4: uuidv4 } = require('uuid');

function requestId(req, res, next) {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.trim() ? incoming.trim() : uuidv4();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

module.exports = { requestId };

