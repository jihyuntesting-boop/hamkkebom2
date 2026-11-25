'use strict';
const {serve} = require('../server/place-catalog.cjs');
module.exports = (req,res) => serve('nearby',req,res);
