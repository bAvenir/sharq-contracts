var util = require('../util/util'); // Cross-domain functions
var getModule = {};

/**
 * Contract feeds
 * @param {String} uid
 *
 * @return {Array} Contract requests
 */
getModule.contractFeeds = function(uid, db) {
  return db.userOp.findOne({
      _id: uid
    }, {
      hasContracts: 1
    })
    .then(function(response) {
      var openContracts = [];
      for (var i = 0, l = response.hasContracts.length; i < l; i++) {
        if (!response.hasContracts[i].approved || response.hasContracts[i].inactive.length > 0) {
          openContracts.push(response.hasContracts[i]);
        }
      }
      openContracts = openContracts.length > 0 ? openContracts : false;
      return Promise.resolve(openContracts);
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
};

/**
 * Contract info - return one contract
 * @param {String} ctid
 * @param {String} uid
 *
 * @return {Object} Contract instance
 */
getModule.contractInfo = function(obj, req, res, db, funcs) {
  return db.contractOp.findOne(obj.query).lean()
    .then(function(data) {
      if (!data) {
        funcs.logger.log(req, res, {
          type: 'warn',
          data: "The contract with: " + JSON.stringify(obj.query) + " could not be found"
        });
        return Promise.resolve(false);
      } else if (!util.uidInContract(obj.uid, data)) {
        funcs.logger.log(req, res, {
          type: 'warn',
          data: "You are not part of the contract with ctid: " + data.ctid
        });
        res.status(401);
        return Promise.resolve("You are not part of the contract with ctid: " + data.ctid);
      } else {
        return Promise.resolve(data);
      }
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
};

/*
Get user contracts
*/
getModule.fetchContract = function(req, res, db, funcs) {
  var id = req.params.id; // User id
  var offset = req.query.offset;
  var limit = req.query.limit;
  var filter = req.query.filter;
  var aggregation = [];
  aggregation.push({
    $match: {
      "_id": id
    }
  });
  aggregation.push({
    $unwind: "$hasContracts"
  });
  if (Number(filter) !== 0) {
    var filterOptions = [{
        $match: {
          "hasContracts.imForeign": true
        }
      },
      {
        $match: {
          "hasContracts.imForeign": false
        }
      },
      // { $match:{ $or:[{"hasContracts.imAdmin": false}, {"hasContracts.imForeign": false}] }},
      {
        $match: {
          $or: [{
            "hasContracts.approved": false
          }, {
            "hasContracts.inactive": {
              $gt: 0
            }
          }]
        }
      }
    ];
    aggregation.push(filterOptions[Number(filter) - 1]);
  }
  aggregation.push({
    $sort: {
      "hasContracts.id": -1
    }
  });
  if (Number(offset) !== 0) aggregation.push({
    $skip: Number(offset)
  });
  aggregation.push({
    $limit: Number(limit)
  });
  aggregation.push({
    $project: {
      "_id": 0,
      "hasContracts": 1
    }
  });
  return db.userOp.aggregate(aggregation)
    .then(function(response) {
      return db.contractOp.populate(response, {
        path: "hasContracts.id"
      });
    })
    .then(function(contracts) {
      if (contracts.length === 0) {
        contracts = [];
        funcs.logger.log(req, res, {
          type: 'warn',
          data: 'No contracts for: ' + id
        });
        return Promise.resolve(contracts);
      } else {
        return Promise.resolve(contracts);
      }
    })
    .catch(function(error) {
      return Promise.reject(error);
    });
};

// Public Functions
module.exports = getModule;
