const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'sessions.json');

function loadSessions() {
  if (!fs.existsSync(SESSION_FILE)) return {};
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveSessions(sessions) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), { encoding: 'utf-8' });
}

let sessions = loadSessions();

function getSession(sessionKey) {
  return sessions[sessionKey] || {};
}

function saveSession(sessionKey, data) {
  sessions[sessionKey] = data;
  saveSessions(sessions);
}

function getAllSessions() {
  return sessions;
}

module.exports = {
  getSession,
  saveSession,
  getAllSessions
}; 
