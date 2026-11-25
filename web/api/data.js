'use strict';
// Keep the historical /api/data?type=weather URL local to this Vercel release.
// The standalone /api/weather handler owns validation and the KMA response contract.
const {serve} = require('../server/place-catalog.cjs');
const weather = require('./weather.js');
module.exports = (req,res) => {
  if (req.query?.type === 'weather') return weather(req,res);
  return serve('data',req,res);
};
