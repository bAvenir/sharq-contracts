var util = require('../util/util'); // Cross-domain functions
var checksModule = {};

/**
 * Checks uniqueness of the contract to be created
 * Resolves true if contract would be unique
 * @return {Promise}
 */
checksModule.isUnique = function(req, res, db, funcs) {
  var items = [];
  var cts = {};
  var unique = true;
  util.getOnlyProp(items, req.body.oidsService, ['id']);
  util.getOnlyProp(items, req.body.oidsDevice, ['id']);
  return db.itemOp.find({
    _id: {
      $in: items
    }
  }, {
    hasContracts: 1
  }, function(err, response) {
    if (err) return Promise.reject(false);
    return Promise.resolve(true);
  })
  .then(function(response){
    for (var i = 0, l = response.length; i < l; i++) {
      for (var j = 0, ll = response[i].hasContracts.length; j < ll; j++) {
        if (i === 0) {
          cts[response[i].hasContracts[j].extid] = 1;
        } else {
          for (var key in cts) {
            if (key === response[i].hasContracts[j].extid) {
              cts[response[i].hasContracts[j].extid]++;
            }
          }
        }
      }
    }
    for (var k in cts) {
      if (cts[k] === items.length) unique = false;
    }
    return Promise.resolve(unique);
  })
  .catch(function(error){
    return Promise.reject(false);
  });
};

/*
Check post contract validity
*/
checksModule.postCheck = function(data, roles, cid, db, funcs, callback) {
  var result, resultUid, resultCid; // Boolean; return true if all the conditions meet
  var items = [];

  // Check that IoTOwner matches with the user doing the contract request
  imIotOperator = roles.indexOf('infrastructure operator') !== -1;
  sameCompany = cid.toString() === data.cidDevice.id.toString();
  result = imIotOperator && sameCompany;

  if (result) {
    util.getOnlyProp(items, data.oidsDevice, ['id']);
    util.getOnlyProp(items, data.oidsService, ['id']);
    var cidService = data.cidService.id;
    var friends = false; // Organisations are friends
    var canContinue = true; // Contract can be signed
    var knows = [];
    return db.userAccountOp.findOne({
        _id: cid
      }, {
        knows: 1
      })
      .then(function(response) {
        util.getOnlyProp(knows, response.knows, ['id']);
        for (var i = 0; i < knows.length; i++) {
          if (cidService.toString() === knows[i].toString()) {
            friends = true;
          }
        }
        return db.itemOp.find({
          _id: {
            $in: items
          }
        }, {
          'accessLevel': 1
        });
      })
      .then(function(response) {
        if (friends) {
          for (var i = 0; i < response.length; i++) {
            if (response[i].accessLevel === 0) {
              canContinue = false;
            }
          }
        } else {
          for (var j = 0; j < response.length; j++) {
            if (response[j].accessLevel <= 1) {
              canContinue = false;
            }
          }
        }
        return Promise.resolve(canContinue);
      })
      .then(function(response) {
        if (response) {
          callback(false, 'authorized', true);
        } else {
          callback(false, 'Some items cannot be shared', false);
        }
      })
      .catch(function(error) {
        callback(true, error, false);
      });

    // Check that the items are not simultaneously controlled by more than one service
    // TODO after discussing with partners requirements!!

  } else {
    callback(false, 'Contract requester must be the IoT Owner', false);
  }
};


/*
Check delete contract validity
Check that I am part of the contract I want to delete
*/
checksModule.deleteCheck = function(query, db, funcs, callback) {
  return db.userOp.findOne(query, {
      hasContracts: 1
    })
    .then(function(response) {
      if (response) {
        callback(false, 'Authorized', true);
      } else {
        callback(false, 'Unauthorized', false);
      }
    })
    .catch(function(error) {
      callback(true, error, false);
    });
};

/*
Check accept contract validity
Check that I am a contracting party and the contract awaits my approval
*/
checksModule.acceptCheck = function(query, db, funcs, callback) {
  query['hasContracts.approved'] = false;
  return db.userOp.findOne(query, {
      hasContracts: 1
    })
    .then(function(response) {
      if (response) {
        return Promise.resolve(true);
      } else {
        delete query['hasContracts.approved'];
        query['hasContracts.inactive'] = {
          $gt: []
        };
        return db.userOp.findOne(query, {
          hasContracts: 1
        });
      }
    })
    .then(function(response) {
      if (response) {
        callback(false, 'Authorized', true);
      } else {
        callback(false, 'Unauthorized', false);
      }
    })
    .catch(function(error) {
      callback(true, error, false);
    });
};

/*
Checks if a user can be pulled from a contract
Is the case of user is no contract admin and has no items in it
*/
checksModule.checkContracts = function(userId, userMail, db, funcs, callback) {
  var ctids_notAdmin = [];
  return db.userOp.findOne({
      _id: userId
    }, {
      hasContracts: 1
    })
    .then(function(response) {
      // Get only the contracts of which the user is not ADMIN
      util.getOnlyIdCondition(ctids_notAdmin, response.hasContracts);
      if (ctids_notAdmin.length > 0) { // Check if there is any contracts to check
        funcs.sync.forEachAll(ctids_notAdmin,
          function(value, allresult, next, otherParams) {
            var ctid = value;
            db.itemsOp.find({
                'uid.id': userId,
                'hasContracts.id': ctid
              }, {
                oid: 1
              })
              .then(function(data) {
                if (data) {
                  // If there are devices still, do not pull the user from the contract
                  callback(true, true);
                } else {
                  return db.contractOp.update({
                    "_id": ctid
                  }, {
                    $pull: {
                      "iotOwner.uid": {
                        id: userId
                      }
                    }
                  });
                }
              })
              .then(function(response) {
                allresult.push(true);
                next();
              })
              .catch(function(err) {
                allresult.push(true);
                next();
              });
          },
          function(allresult) {
            if (allresult.length === ctids_notAdmin.length) {
              callback(false, true);
            }
          },
          false, {}
        );
      } else {
        callback(false, false);
      }
    })
    .catch(function(err) {
      callback(true, err);
    });
};

/*
Checks if a contract has to be removed
Case one party has no items in it
*/
checksModule.contractValidity = function(ctids, uid, mail, db, funcs) {
  var toRemoveCtid = [];
  var toRemoveId = [];
  var ownUsers = [],
    ownItems = [];
  var foreignUsers = [],
    foreignItems = [];
  var auxids = [];

  return db.contractOp.find({
      "ctid": {
        $in: ctids
      },
      $or: [{
          "foreignIot.items": {
            $exists: true,
            $size: 0
          }
        },
        {
          "iotOwner.items": {
            $exists: true,
            $size: 0
          }
        }
      ]
    }, {
      ctid: 1,
      'foreignIot': 1,
      'iotOwner': 1
    })
    .then(function(data) {
      if (data.length === 0) return Promise.resolve(false);
      util.getOnlyProp(toRemoveCtid, data, ['ctid']);
      util.getOnlyProp(toRemoveId, data, ['_id']);
      util.getOnlyProp(foreignUsers, data, ['foreignIot', 'uid']);
      util.getOnlyProp(ownUsers, data, ['iotOwner', 'uid']);
      util.getOnlyProp(foreignItems, data, ['foreignIot', 'items']);
      util.getOnlyProp(ownItems, data, ['iotOwner', 'items']);
      var newCt = {
        foreignIot: {},
        iotOwner: {},
        legalDescription: "",
        status: 'deleted'
      };
      return db.contractOp.update({
        "ctid": {
          $in: toRemoveCtid
        }
      }, {
        $set: newCt
      }, {
        multi: true
      });
    })
    .then(function(data) { // Remove contracts from users
      var users = [];
      for (var i = 0, l = toRemoveCtid.length; i < l; i++) {
        util.getOnlyProp(auxids, ownUsers[i].concat(foreignUsers[i]), ['id']);
        users.push(db.userOp.update({
          _id: {
            $in: auxids
          }
        }, {
          $pull: {
            "hasContracts": {
              extid: toRemoveCtid[i]
            }
          }
        }, {
          multi: true
        }));
        auxids = [];
      }
      return Promise.all(users);
    })
    .then(function(data) { // Remove contracts from items
      var items = [];
      for (var i = 0, l = toRemoveCtid.length; i < l; i++) {
        util.getOnlyProp(auxids, ownItems[i].concat(foreignItems[i]), ['id']);
        items.push(db.itemOp.update({
          _id: {
            $in: auxids
          }
        }, {
          $pull: {
            "hasContracts": {
              extid: toRemoveCtid[i]
            }
          }
        }, {
          multi: true
        }));
        auxids = [];
      }
      return Promise.all(items);
    })
    .then(function(data) { // Notify users
      var notifications = [];
      for (var i = 0, l = toRemoveCtid.length; i < l; i++) {
        var obj = {};
        obj.ct_id = toRemoveId[i];
        obj.ctid = toRemoveCtid[i];
        obj.token_uid = uid;
        obj.token_mail = mail;
        obj.ownUsers = ownUsers[i];
        obj.foreignUsers = foreignUsers[i];
        obj.imAdmin = true;
        obj.type = "DELETE";
        notifications.push(util.createNotifAndAudit(obj, funcs));
      }
      return Promise.all(notifications);
    })
    .then(function(data) {
      return Promise.resolve(true);
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
};

// Public Functions
module.exports = checksModule;
