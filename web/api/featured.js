'use strict';
const {serve} = require('../server/featured-catalog.cjs');
module.exports = (req,res) => serve(req,res);
