
function telnetConnection(host, port) {
  return new Promise((resolve, reject) => {
    var output = "";
    var client = new net.Socket();
    client.connect(port, host, ()=> {
    })
    client.on('data', data => {
      console.log(data.toString())
      output += data.toString();
    });
    setTimeout(()=> {
      client.destroy();
      resolve(output);
    },300);
  });
}
var net = require('net');
telnetConnection('aardmud.org', 23)
.then(output => {
  console.log("GOT OUTPUT"+output);
});
