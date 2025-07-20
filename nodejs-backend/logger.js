const fs = require('fs');
const path = require('path');

function getTimestamp() {
  return new Date().toISOString();
}

const logFile = path.join(__dirname, 'server.log');

function logToFile(level, message) {
  const line = `[${getTimestamp()}] [${level}] ${message}\n`;
  fs.appendFileSync(logFile, line, { encoding: 'utf-8' });
}

const logger = {
  info: (msg) => {
    console.log(`[INFO] ${msg}`);
    logToFile('INFO', msg);
  },
  error: (msg) => {
    console.error(`[ERROR] ${msg}`);
    logToFile('ERROR', msg);
  },
  analytics: (event, data) => {
    const line = `[${getTimestamp()}] [ANALYTICS] ${event} ${JSON.stringify(data)}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf-8' });
  }
};

module.exports = logger; 


