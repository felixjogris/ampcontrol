#!/usr/bin/node

var http = require("http");
var url = require("url");
var net = require("net");

var conn;
var connected = false;
var clearToSend = false;
var queue = [];

var powered = false;
var muted = false;
var volume = 0;

function sendResponse(request, response, httpcode, contenttype, body) {
  process.nextTick(function() {
    response.writeHead(httpcode, {
      "Content-Type"   : contenttype,
      "Content-Length" : body.length
    });
    response.end(body, function() {
      console.log("%s %s %d %d %s %s",
                  new Date().toISOString(),
                  request.socket.remoteAddress, httpcode,
                  body.length, request.method, request.url);
    });
  });
}

function recv(data) {
  var datalen = data.byteLength;
  if (datalen < 20) {
    console.log("received short packet");
    return;
  }

  var cmdlen = ((data[8] * 256 + data[9]) * 256 + data[10]) * 256 + data[11] - 4;
  
  if ((data[0] != 'I'.charCodeAt(0)) ||
      (data[1] != 'S'.charCodeAt(0)) ||
      (data[2] != 'C'.charCodeAt(0)) ||
      (data[3] != 'P'.charCodeAt(0)) ||
      (data[4] != 0)  || (data[5] != 0)  || (data[6] != 0)  || (data[7] != 16) ||
      (data[12] != 1) || (data[13] != 0) || (data[14] != 0) || (data[15] != 0) ||
      (data[16] != '!'.charCodeAt(0))    || (data[17] != '1'.charCodeAt(0)) ||
      (data[datalen - 2] != 0x1a)        || (data[datalen - 1] != '\r'.charCodeAt(0)) ||
      (cmdlen < 0) || (cmdlen + 20 > datalen)) {
    console.log("received bogus packet");
    return;
  }

  var cmd = String.fromCharCode(...data.slice(18, 18 + cmdlen));
  var cmd3 = (cmdlen > 3 ? cmd.substr(0, 3) : "");

  if (cmd == "PWR00") {
    powered = false;
  } else if (cmd == "PWR01") {
    powered = true;
  } else if (cmd == "AMT00") {
    muted = false;
  } else if (cmd == "AMT01") {
    muted = true;
  } else if (cmd3 == "MVL") {
    volume = parseInt(cmd.substr(3), 16);
  } else if (cmd3 == "SLI") {
  }

  console.log("powered=%s muted=%s volume=%d", powered.toString(), muted.toString(), volume);
}

function trySend() {
  if (connected && clearToSend && queue.length > 0) {
    clearToSend = false;

    var cmd = queue.shift();
    var cmdlen = 2 + cmd.byteLength + 1;
    var data = new Array(16 + cmdlen);

    data[0] = 'I';
    data[1] = 'S';
    data[2] = 'C';
    data[3] = 'P';
    data[4] = 0;
    data[5] = 0;
    data[6] = 0;
    data[7] = 16;

    for (var i = 11; i >= 8; i--) {
      data[i] = cmdlen % 256;
      cmdlen = cmdlen >> 8;
    }

    data[12] = 1;
    data[13] = 0;
    data[14] = 0;
    data[15] = 0;
    data[16] = '!';
    data[17] = '1';

    for (var i = cmd.byteLength - 1; i >= 0; i--) {
      data[18 + i] = cmd[i];
    }

    data[data.length - 1] = '\r';

    conn.write(data);
  }
}

function send(data) {
  queue.push(data);
  trySend();
}

function connect() {
  conn = net.createConnection(60128, "onkyo");
  conn.on("connect", function() {
    connected = true;
    clearToSend = true;
    queue = [ "PWRQSTN", "MVLQSTN", "AMTQSTN", "SLIQSTN" ];
    trySend();
  });
  conn.on("end", function() {
    connected = false;
    conn.destroy();
  });
  conn.on("data", function(data) {
    recv(data);
    clearToSend = true;
    trySend();
  });
};

connect();

var server = http.createServer(function(request, response) {
  request.on("error", function(err) {
    console.error(err);
    response.writeHead(400);
    response.end();
  });
  response.on("error", function(err) {
    console.error(err);
  });

  var path = url.parse(request.url, true);

  if (request.method != "GET") {
    sendResponse(request, response, 400, "text/plain", "http method not supported");
  } else if (path.pathname == "/") {
    sendResponse(request, response, 200, "text/plain", "hello, world");
  } else if (path.pathname == "/getstatus") {

  } else if (path.pathname == "/favicon.ico") {
    sendResponse(request, response, 404, "image/x-icon", "");
  } else {
    sendResponse(request, response, 404, "text/plain", "file not found");
  }
});
server.listen(8082);