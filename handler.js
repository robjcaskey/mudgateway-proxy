'use strict';



module.exports.hello = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
    }),
  };

};
module.exports.logConnection = async (event, context) => {
  // Load the AWS SDK for Node.js
  var AWS = require('aws-sdk');
  // Set the region 
  //AWS.config.update({region: 'REGION'});

  // Create the DynamoDB service object
  var ddb = new AWS.DynamoDB({apiVersion: '2012-10-08'});
  var prefix = process.env.TABLE_PREFIX;
  var timestamp = new Date().getTime();
  var params = {
    TableName: prefix+'connections',
    Item: {
      'host' : {S: 'test'},
      'connected' : {N: timestamp},
    }
  };

  // Call DynamoDB to add the item to the table
  return new Promise((resolve, reject) => {
    ddb.putItem(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        
        resolve(data);
      }
    });
  })
  .catch(e => {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error',
        input: event,
      }),
    };
  })
  .then(()=> {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'OK',
        input: event,
      }),
    };
  });
};
