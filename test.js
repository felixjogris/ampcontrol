#!/usr/local/bin/node

var net = require("net");
var process = require("process");
var console = require("console");

conn = net.createConnection(60128, "onkyo");
conn.setKeepAlive(true);
conn.setNoDelay(true);

var cmd = "NTC" + process.argv[2];
console.log("cmd:"+cmd);

var cmdlen = 2 + cmd.length + 1;
var data = new Buffer(16 + cmdlen);

data[0] = 'I'.charCodeAt(0);
data[1] = 'S'.charCodeAt(0);
data[2] = 'C'.charCodeAt(0);
data[3] = 'P'.charCodeAt(0);
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
data[16] = '!'.charCodeAt(0);
data[17] = '1'.charCodeAt(0);

for (var i = cmd.length - 1; i >= 0; i--) {
  data[18 + i] = cmd.charCodeAt(i);
}

data[data.length - 1] = '\r'.charCodeAt(0);

conn.write(data);

conn.end();
