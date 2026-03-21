// test-https.js
const https = require('https');
https.get('https://www.google.com', res => {
  console.log('Success:', res.statusCode);
}).on('error', e => {
  console.error(e);
});