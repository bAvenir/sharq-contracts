/* Explain what this package is about */

var pubFunctions = {};

/*
Create Contract
*/
pubFunctions.create = require('./services/create');

/*
Accept Contract
*/
pubFunctions.accept = require('./services/accept');

/*
Manage semantic repository
*/
// pubFunctions.mgmtSemanticRepo = require('./services/semantic');


// Public Functions
module.exports = pubFunctions;
