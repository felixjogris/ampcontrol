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
var input = "";
var inputs = {
  "10": "DVD",
  "00": "VCR/DVR",
  "01": "CBL/SAT",
  "02": "GAME/TV",
  "03": "AUX1",
  "04": "AUX2",
  "20": "TAPE",
  "24": "TUNER",
  "23": "CD",
  "22": "PHONO",
  "28": "NET/USB"
};

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
    volume = -82 + parseInt(cmd.substr(3), 16);
  } else if (cmd3 == "SLI") {
    input = cmd.substr(3);
  } else {
    console.log("unknown cmd=%s", cmd);
  }

//  console.log("powered=%s muted=%s volume=%d input=%s", powered.toString(), muted.toString(), volume, input);
}

function trySend() {
  if (connected && clearToSend && queue.length > 0) {
    clearToSend = false;

    var cmd = queue.shift();
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
//    console.log("send %d bytes, cmd=%s", data.length, cmd);
  }
}

function send(data) {
  queue.push(data);
  trySend();
}

function connect() {
  conn = net.createConnection(60128, "onkyo");
  conn.setKeepAlive(true);
  conn.setNoDelay(true);
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

function evalQuery(query) {
  if (Object.keys(query).length != 1) {
    return "exactly one setting expected";
  }

  if ("power" in query) {
    if (query["power"]) {
      send("PWR01");
    } else  {
      send("PWR00");
    }
  } else if ("mute" in query) {
    if (query["mute"]) {
      send("AMT01");
    } else {
      send("AMT00");
    }
  } else if ("volume" in query) {
    var vol = query["volume"];
    var newVolume = parseInt(vol);
    if (isNaN(newVolume) || (newVolume <= -82) || (newVolume > -25)) {
      return "invalid volume setting: " + vol;
    } else {
      newVolume += 82;
      var hexVol = newVolume.toString(16).toUpperCase();
      if (hexVol.length < 2) {
        hexVol = "0" + hexVol;
      }
      send("MVL" + hexVol);
    }
  } else if ("input" in query) {
    var newInput = query["input"];
    if (newInput in inputs) {
      send("SLI" + newInput);
    } else {
      return "invalid input setting: " + newInput;
    }
  } else {
    return "unknown setting";
  }

  return "";
}

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
    sendResponse(request, response, 200, "text/html", index_html);
  } else if (path.pathname == "/getstatus") {
    sendResponse(request, response, 200, "application/json", JSON.stringify({
      "connected" : connected,
      "powered"   : powered,
      "muted"     : muted,
      "volume"    : volume,
      "input"     : input
    }));
  } else if (path.pathname == "/getinputs") {
    sendResponse(request, response, 200, "application/json", JSON.stringify(inputs));
  } else if (path.pathname == "/set") {
    var error = evalQuery(path.query);
    sendResponse(request, response, (error ? 400 : 200), "text/plain", (error ? error : "ok"));
  } else if (path.pathname == "/reconnect") {
    connect();
    sendResponse(request, response, 200, "text/plain", "ok");
  } else if (path.pathname == "/favicon.ico") {
    sendResponse(request, response, 404, "image/x-icon", "");
  } else {
    sendResponse(request, response, 404, "text/plain", "file not found");
  }
});
server.listen(8082);

var index_html = function(){/*
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">
<html>
<head>
<title>ampcontrol</title>
<meta name="viewport" content="width=device-width">
<style type="text/css">
body {
  font-family:sans-serif;
  font-size:250%;
  color:white;
  padding:0;
  margin:0;
  background-color:black;
}
#errorPane {
  width:100%;
  height:100%;
  position:absolute;
  top:0;
  left:0;
  opacity:0.1;
  background-color:#ccc;
  visibility:hidden;
  padding:0;
  margin:0;
  z-index:998;
}
#errorText, #reconnect {
  width:100%;
  position:absolute;
  top:50%;
  left:0;
  text-align:center;
  vertical-align:middle;
  opacity:1;
  background-color:red;
  visibility:hidden;
  color:white;
  font-weight:bold;
  font-size:large;
  padding:0.1em 0em 0.1em 0em;
  margin:0;
  z-index:999;
}
input, select, option {
  font-family:sans-serif;
  font-size:100%;
}
#ampcontrol {
  width:300px;
  height:800px;
}
.row, #mute, #power, #inputs, #volume, #led, #about {
  width:100%;
  text-align:center;
}
#volume, a {
  color:darkcyan;
}
#volume {
  font-size:150%;
}
#volminus, #volplus {
  width:50%;
}
#about {
  margin-top:10%;
  font-size:50%;
}
</style>
</head>
<body>
<div id="ampcontrol">
<div id="led">&bull;</div>
<div class="row">
<input id="power" type="button" value="Power" onClick="toggle('power');">
</div>
<div class="row">
<input id="mute" type="button" value="Mute" onClick="toggle('mute');">
</div>
<div id="volume"></div>
<div class="row">
<input id="volminus" type="button" value="&darr;" onClick="setVolume(-1);"><input id="volplus" type="button" value="&uarr;" onClick="setVolume(1);">
</div>
<div class="row">
<select id="inputs" onClick="setInput();"></select>
</div>
<div id="about">
<a href="http://ogris.de/ampcontrol/" target="_blank">ampcontrol</a>
</div>
</div>

<div id="errorPane"></div>
<div id="errorText">Connection lost!</div>
<div id="reconnect">Amplifier down! <input type="button" value="Reconnect" onClick="reconnect();"></div>

<script type="text/javascript">
<!--
var data = {};

function reconnect () {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.timeout = 10000;
  xmlHttp.open("GET", "/reconnect");
  xmlHttp.send();
}

function setAny (what, level) {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.timeout = 10000;
  xmlHttp.open("GET", "/set?" + what + "=" + level);
  xmlHttp.send();
}

function toggle (what) {
  setAny(what, !data[what]);
}

function setVolume (incr) {
  var newVolume = parseInt(data["volume"]) + incr;
  setAny("volume", newVolume.toString());
}

function setInput () {
  setAny("input", document.getElementById("inputs").value);
}

function getInputs () {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.timeout = 10000;
  xmlHttp.onreadystatechange = function () {
    if ((xmlHttp.readyState == 4) && (xmlHttp.status == 200)) {
      try {
        var inputs = JSON.parse(xmlHttp.response);
        Object.keys(inputs).forEach(function (input) {
          if (document.getElementById("inputs")) {
            document.getElementById("inputs").add(new Option(inputs[input], input));
          }
        });
      } catch (e) {
      }
    }
  };
  xmlHttp.open("GET", "/getinputs");
  xmlHttp.send();
}

function processStatus (response) {
  try {
    data = JSON.parse(response);
    var reconnect, led, power, state, opacity;

    if (!data["connected"]) {
      reconnect = "visible";
      led = "white";
      power = "disabled";
      state = "disabled";
      opacity = "0.0";
    } else if (!data["powered"]) {
      reconnect = "hidden";
      led = "red";
      power = "";
      state = "disabled";
      opacity = "0.0";
    } else if (data["muted"]) {
      reconnect = "hidden";
      led = "white";
      power = "";
      state = "";
      opacity = "0.5";
    } else {
      reconnect = "hidden";
      led = "white";
      power = "";
      state = "";
      opacity = "1.0";
    }
    
    document.getElementById("reconnect").style.visibility = reconnect;
    document.getElementById("led").style.color = led;
    document.getElementById("power").disabled = power;
    document.getElementById("mute").disabled = state;
    document.getElementById("volminus").disabled = state;
    document.getElementById("volume").style.opacity = opacity;
    document.getElementById("volplus").disabled = state;
    document.getElementById("inputs").disabled = state;

    document.getElementById("volume").innerHTML = data["volume"] + "dB";
    document.getElementById("inputs").value = data["input"];
  } catch (e) {
    toggleErrorPane("visible");
  }
}

function toggleErrorPane (visibility) {
  var errorPane = document.getElementById("errorPane");

  if (errorPane.style.visibility != visibility) {
    errorPane.style.visibility = visibility;
    document.getElementById("errorText").style.visibility = visibility;
  }
}

function startRequest () {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.timeout = 10000;
  xmlHttp.onreadystatechange = function () {
    if (xmlHttp.readyState == 4) {
      if (xmlHttp.status == 200) {
        toggleErrorPane("hidden");
        processStatus(xmlHttp.response);
      } else {
        toggleErrorPane("visible");
      }
      window.setTimeout(startRequest, 1000);
    }
  };
  xmlHttp.open("GET", "/getstatus");
  xmlHttp.send();
}

getInputs();
startRequest();

-->
</script>
</body>
</html>
*/}.toString().slice(15, -4);
