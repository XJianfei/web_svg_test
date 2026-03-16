import https from 'https';

https.get('https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    const lines = data.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].includes('{"character":"身"')) {
        console.log(lines[i]);
        process.exit(0);
      }
    }
    data = lines[lines.length - 1];
  });
});
