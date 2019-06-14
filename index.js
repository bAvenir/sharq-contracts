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
Modify Contract
*/
pubFunctions.pauseContracts = require('./services/modify').pauseContracts;
pubFunctions.enableOneItem = require('./services/modify').enableOneItem;
pubFunctions.removeOneItem = require('./services/modify').removeOneItem;
pubFunctions.resetContract = require('./services/modify').resetContract;

/*
Check Contract
*/
pubFunctions.isUnique = require('./services/checks').isUnique;
pubFunctions.postCheck = require('./services/checks').postCheck;
pubFunctions.deleteCheck = require('./services/checks').deleteCheck;
pubFunctions.acceptCheck = require('./services/checks').acceptCheck;
pubFunctions.checkContracts = require('./services/checks').checkContracts;
pubFunctions.contractValidity = require('./services/checks').contractValidity;

/*
Manage semantic repository
*/
pubFunctions.mgmtSemanticRepo = require('./services/semantic');


// Public Functions
module.exports = pubFunctions;
