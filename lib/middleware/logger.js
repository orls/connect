
/*!
 * Connect - logger
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

/**
 * Log buffer.
 */

var buf = [];

/**
 * Default log buffer duration.
 */

var defaultBufferDuration = 1000;

/**
 * Log requests with the given `options` or a `format` string.
 *
 * Options:
 *
 *   - `format`  Format string, see below for tokens
 *   - `stream`  Output stream, defaults to _stdout_
 *   - `buffer`  Buffer duration, defaults to 1000ms when _true_
 *
 * Tokens:
 *
 *   - `:req[header]` ex: `:req[Accept]`
 *   - `:res[header]` ex: `:res[Content-Length]`
 *   - `:http-version`
 *   - `:response-time`
 *   - `:remote-addr`
 *   - `:date`
 *   - `:method`
 *   - `:url`
 *   - `:referrer`
 *   - `:user-agent`
 *   - `:status`
 *
 * @param {String|Object} format or options
 * @return {Function}
 * @api public
 */

module.exports = function logger(options) {
  if ('string' == typeof options) {
    options = { format: options };
  } else {
    options = options || {};
  }

  var fmt = options.format
    , stream = options.stream || process.stdout
    , buffer = options.buffer;

  // buffering support
  if (buffer) {
    var realStream = stream
      , interval = 'number' == typeof buffer
        ? buffer
        : defaultBufferDuration;

    // flush interval
    setInterval(function(){
      if (buf.length) {
        realStream.write(buf.join(''), 'ascii');
        buf.length = 0;
      }
    }, interval); 

    // swap the stream
    stream = {
      write: function(str){
        buf.push(str);
      }
    };
  }

  return function logger(req, res, next) {
    var start = +new Date
      , statusCode
      , resHeaders
      , writeHead = res.writeHead
      , end = res.end
      , url = req.originalUrl;

    // mount safety
    if (req._logging) return next();

    // flag as logging
    req._logging = true;

    // proxy for statusCode.
    res.writeHead = function(code, phrase, headers){
      if(phrase && !headers){
        headers = phrase;
        phrase = null;
      }
      res.writeHead = writeHead;
      if(phrase)
        res.writeHead(code, phrase, headers);
      else
        res.writeHead(code, headers)
      res._statusCode = statusCode = code;
      resHeaders = headers || {};
    };

    // proxy end to output a line to the provided logger.
    if (fmt) {
      res.end = function(chunk, encoding) {
        res.end = end;
        res.end(chunk, encoding);
        res.responseTime = +new Date - start;
        stream.write(format(fmt, req, res) + '\n', 'ascii');
      };
    } else {
      res.end = function(chunk, encoding) {
        res.end = end;
        res.end(chunk, encoding);

        stream.write((req.socket && req.socket.remoteAddress)
           + ' - - [' + (new Date).toUTCString() + ']'
           + ' "' + req.method + ' ' + url
           + ' HTTP/' + req.httpVersionMajor + '.' + req.httpVersionMinor + '" '
           + statusCode + ' ' + (resHeaders['Content-Length'] || '-')
           + ' "' + (req.headers['referer'] || req.headers['referrer'] || '')
           + '" "' + (req.headers['user-agent'] || '') + '"\n', 'ascii');
      };
    }

    next();
  };
};

/**
 * Return formatted log line.
 *
 * @param  {String} str
 * @param  {IncomingMessage} req
 * @param  {ServerResponse} res
 * @return {String}
 * @api private
 */
 
function format(str, req, res) {
  return str
    .replace(':url', req.originalUrl)
    .replace(':method', req.method)
    .replace(':status', res._statusCode)
    .replace(':response-time', res.responseTime)
    .replace(':date', new Date().toUTCString())
    .replace(':referrer', req.headers['referer'] || req.headers['referrer'] || '')
    .replace(':http-version', req.httpVersionMajor + '.' + req.httpVersionMinor)
    .replace(':remote-addr', req.socket && req.socket.remoteAddress)
    .replace(':user-agent', req.headers['user-agent'] || '')
    .replace(/:req\[([^\]]+)\]/g, function(_, header){ return req.headers[header]; })
    .replace(/:res\[([^\]]+)\]/g, function(_, header){ return res._headers[header]; });
}