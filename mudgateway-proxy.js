#!/usr/bin/env node
var Promise = require('bluebird');
var net = require('net');
var WebSocketServer = require('websocket').server;
var http = require('http');
var request = require('request');

var connections = {};
var naughtyList = [];

var MUDGATEWAY_ACCESS_KEY_ID = process.env.MUDGATEWAY_ACCESS_KEY_ID;
var MUDGATEWAY_SECRET_ACCESS_KEY = process.env.MUDGATEWAY_SECRET_ACCESS_KEY;



function apiCheck(url, params) {
  var rootUrl = "https://api-dev.mudgateway.com";
  return new Promise((resolve, reject) => {
    var options = {
      uri:rootUrl+url,
      method: 'POST',
      json: params
    }
    request.post(options, (error, response, body) => {
      policyHandler.log(error)
      if(error) {
        reject(error);
      }
      else {
        if(response.statusCode == 200) {
          resolve(response);
        }
        else {
          policyHandler.log(response.body);
          reject(response);
        }
      }
    })
  });
}

var MudGatewayPolicyHandler = function() {
}

MudGatewayPolicyHandler.prototype.checkAllowed = function(options) {
  return apiCheck("/checkAllowed", options);
}
MudGatewayPolicyHandler.prototype.registerGateway = function(options) {
  return apiCheck("/registerGateway", options);
}
MudGatewayPolicyHandler.prototype.attemptBan = function(options) {
  return apiCheck("/attemptBan", options);
}
MudGatewayPolicyHandler.prototype.log = function(...args) {
console.log(...args)
  return;
}

var LocalPolicyHandler = function() {
  this.AccessList = [
    "aardmud.org:23",
    "localhost:4201",
    "localhost:4000",
    "localhost:23"
  ];
}
LocalPolicyHandler.prototype.log = function(...args) {
  return console.log(...args);
}
LocalPolicyHandler.prototype.checkAllowed = function(options) {
  policyHandler.log("Checking locally");
  var key = options.host+":"+options.port;
  return Promise.resolve(this.AccessList.indexOf(key) !== -1);
}
LocalPolicyHandler.prototype.checkCharacterNameCanBan = function(name) {
  var key = options.host+":"+options.port;
  return Promise.resolve(this.AccessList.indexOf(key) !== -1);
}
LocalPolicyHandler.prototype.registerGateway = function() {
  return Promise.resolve();
}

var PolicyHandler = MUDGATEWAY_ACCESS_KEY_ID ? MudGatewayPolicyHandler  : LocalPolicyHandler;
var policyHandler = new PolicyHandler();
policyHandler.log("Access key was"+MUDGATEWAY_ACCESS_KEY_ID)

var maxConnectionId = 0;
function createConnectionId() {
  maxConnectionId++;
  return maxConnectionId;
}

var proxyConnections = {};

function banSrcAddress(realAddress) {
  return Object.keys(proxyConnections).map(connectionId => {
    var connection = proxyConnections[connectionId];
    if(connection.realAddress.address = realAddress.address) {
      connection.sendClient('disconnected',{disconnectCode:'youWereJustBanned',suggestReconnect:false})
      return connection.close();
    }
  });
}

function TelnetConnection(request, realAddress, sendClient, host, port) {
  this.sendClient = sendClient;
  this.id = createConnectionId();
  this.realAddress = realAddress;
  var client = new net.Socket();
  var telnetConnection = this;
  sendClient("startingConnect", {})
  client.connect(port, host, ()=> {
    var localAddress = client.address()
    var logEntry = {
      realAddress:realAddress,
      proxyAddress:localAddress,
      destination:{
        host:host,
        port:port,
      }
    }
    policyHandler.log(JSON.stringify(logEntry));
    policyHandler.log("CONNECTED")
    policyHandler.log(request.origin)
    sendClient("connected", {})
    var key = this.id;
    proxyConnections[key] = this;
  })
  this.disclosureList = [];

  var tellRegex = new RegExp("\n\r({tell})?(\\u001b\\[0;36m)?([a-zA-Z0-9 \\-]{2,30}) tells you '(.*)'");
  
  client.on('data', data => {
    function tell(name, message) {
      client.write("\n\rtell "+name+" "+message+"\n\r", "ascii");
    }
    var match = tellRegex.exec(data);
    if(match) {
      policyHandler.log(JSON.stringify(match));
      var results = match.slice(-2)
      var name = results[0];
      var message = results[1];
      if(message == "SCRAM") {
        return policyHandler.attemptBan({adminCharacterName:name,srcAddress:realAddress, host:host, port:port})
        .then(()=> {
          tell(name,"OK. This IP is now banned. Disconnecting.");
          setTimeout(()=> {
            banSrcAddress(realAddress);
          }, 1000);
        })
        .catch(e => {
          policyHandler.log(e)
          tell(name,"We don't have "+name+" listed as an admin for this game. Email robjcaskey@gmail.com to fix.");
        })
      }
      else {
        if(this.disclosureList.indexOf(name) == -1) {
          policyHandler.log(JSON.stringify({name:name,message:message}));
          var socket = request.socket;
          this.disclosureList.push(name);
          var messages = [
            "First-tell auto-reply: I'm connected via a proxy - my real "+socket.remoteFamily+" address is "+socket.remoteAddress+" and my real port is "+socket.remotePort+".",
            "If you tell me SCRAM my IP will instantly be banned from your game. PLEASE do not ban this player's IP address.",
            "It is shared by other well-behaving players. Visit http://comingsoon.info for more info." 
          ];
          messages.map(message => {
            tell(name, message)
          });
        }
      }
    }
    sendClient("telnetData", data)
  });
  this.client = client;
}
TelnetConnection.prototype.write = function(data) {
  this.client.write(data, "ascii");
}
TelnetConnection.prototype.close = function() {
  this.client.destroy();
}
TelnetConnection.prototype.destroy = function(data) {
  policyHandler.log("Running destroy");
  var connectionId = this.id;
  var connection = proxyConnections[connectionId];
  if(connection) {
    delete(proxyConnections[connectionId]);
  }
}

 
var server = http.createServer(function(request, response) {
    policyHandler.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(8080, "0.0.0.0",  function() {
    policyHandler.log((new Date()) + ' Server is listening on port 8080');
});

policyHandler.registerGateway();
 
wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});
 
function originIsAllowed(origin) {
  return true;
}
 
wsServer.on('request', function(request) {
  if (!originIsAllowed(request.origin)) {
    request.reject();
    return;
  }
  function sendClient(action, payload) {
    connection.sendUTF(JSON.stringify({
      action:action,
      payload:payload
    }));
  }
  
  var connection = request.accept('echo-protocol', request.origin);
  var telnetConnection;
  policyHandler.log((new Date()) + ' Connection accepted.');
  connection.on('message', function(message) {
    function reply(action, payload) {
      if(message.ref) {
        sendClient(action, payload.contact({ref:message.ref}));
      }
      else {
        sendClient(action, payload);
      }
    }
    function handleAction(action, payload) {
      if(action == "connect") {
        var host = payload.host;
        var port = payload.port;
        if(telnetConnection) {
          reply('proxyError',{errorCode:'alreadyConnected'}) }
        else {
          var realAddress = {
            address:request.socket.remoteAddress,
            family:request.socket.remoteFamily,
            port:request.socket.remotePort
          }
          return policyHandler.checkAllowed({srcAddress:realAddress, host:host, port:port})
          .then(() => {
            try {
              telnetConnection = new TelnetConnection(request, realAddress, sendClient, host, port);
            }
            catch(e) {
              reply('proxyError',{errorCode:'miscError',ect:e})
            }
          })
          .catch(e => {
            reply('proxyError',{errorCode:'accessDenied'})
          });
        }
      }
      else if(action == "telnetWrite") {
        if(!telnetConnection) {
          reply('proxyError',{errorCode:'notConnected'})
        }
        else {
            policyHandler.log("writing "+JSON.stringify(payload))
            telnetConnection.write(payload);
        }
      }
      else {
        reply('proxyError',{errorCode:'unknownOp'})
      }
    }
    policyHandler.log(message.type)
    if (message.type === 'utf8') {
      policyHandler.log('Received data: ' + message.utf8Data)
      try {
        data = JSON.parse(message.utf8Data);
        var action = data.action ;
        var payload = data.payload;
        try {
          handleAction(action, payload);
        }
        catch(e) {
          reply('proxyError',{errorCode:'couldNotHandleAction',action:action})
        }
      }
      catch(e) {
        reply('proxyError',{errorCode:'couldNotParseMessage'})
      }
    }
    else {
      reply('proxyError',{errorCode:'invalidMessageType'})
    }
  });
  connection.on('close', function(reasonCode, description) {
    policyHandler.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    telnetConnection.destroy();
  });
});
