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
Remove Contract
*/
pubFunctions.cancel = require('./services/cancel').cancel;
pubFunctions.removeAllContract = require('./services/cancel').removeAllContract;

/*
Get Contract
*/
pubFunctions.contractFeeds = require('./services/get').contractFeeds;
pubFunctions.contractInfo = require('./services/get').contractInfo;
pubFunctions.fetchContract = require('./services/get').fetchContract;

/*
Manage semantic repository
*/
// pubFunctions.mgmtSemanticRepo = require('./services/semantic');


// Public Functions
module.exports = pubFunctions;
