'use strict';
const { serve } = require('../server/public-toilets.cjs');
module.exports = (req,res) => serve(req,res);
