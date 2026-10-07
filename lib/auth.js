'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'progress_session';
const DEFAULT_PIN = 'taky-progress';

function getPin() {
  return process.env.ADMIN_PIN || DEFAULT_PIN;
}

function sessionToken() {
  const pin = getPin();
  return crypto.createHash('sha256').update('progress:' + pin).digest('hex');
}

function isAuthed(req) {
  return req.cookies && req.cookies[COOKIE_NAME] === sessionToken();
}

function setAuthCookie(res) {
  res.cookie(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  if (req.path === '/api/health' || req.path === '/login' || req.path === '/logout') {
    return next();
  }
  if (req.path.startsWith('/public/') || req.path.startsWith('/css/') || req.path.startsWith('/js/')) {
    return next();
  }
  if (isAuthed(req)) return next();
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.redirect('/login');
  }
  return res.status(401).send('Unauthorized — please <a href="/login">log in</a>.');
}

module.exports = {
  COOKIE_NAME,
  DEFAULT_PIN,
  getPin,
  isAuthed,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
};
