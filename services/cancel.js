var util = require('../util/util'); // Cross-domain functions
var removeModule = {};

/**
Create a contract request
* @return {Callback}
*/
removeModule.cancel = function(obj, req, res, db, funcs) {
  obj.token_uid = req.body.decoded_token.uid;
  obj.token_mail = req.body.decoded_token.sub;

  var data = {};
  var ctid = {};
  var imForeign;
  var imAdmin;

  return db.userOp.findOne(obj.queryContract, {
      hasContracts: 1
    })
    .then(function(response) {
      for (var i = 0, l = response.hasContracts.length; i < l; i++) {
        if (response.hasContracts[i].id.toString() === obj.id.toString() || response.hasContracts[i].extid === obj.id) {
          imAdmin = response.hasContracts[i].imAdmin;
          imForeign = response.hasContracts[i].imForeign;
        }
      }
      if (imAdmin) {
        return removeModule.removeAllContract(obj, db, funcs);
      } else {
        return removeOneUser(obj, req, res, imForeign, db, funcs);
      }
    })
    .then(function(response) {
      funcs.logger.audit('Contract removed');
      return Promise.resolve(response);
    })
    .catch(function(error) {
      return Promise.reject(error);
    });
};

/**
Remove whole contract
* @return {Promise}
*/
removeModule.removeAllContract = function(obj, db, funcs) {
  var users = [];
  var items = [];
  var data = {};
  var ctid = {};

  return db.contractOp.findOne(obj.queryId).lean()
    .then(function(response) {
      if(!response){
        Promise.reject({continue: true, message: "Contract " + JSON.stringify(obj.queryId) + " does not exist"});
      } else {
        var query = {
          foreignIot: {},
          iotOwner: {},
          legalDescription: "",
          status: "deleted"
        };
        data = response;
        return db.contractOp.update(obj.queryId, {
          $set: query
        });
      }
    })
    .then(function(response) {
      return util.cancelContract(data.ctid, db, funcs);
    })
    .then(function(response) {
      try{
        ctid = {
          id: data._id,
          extid: data.ctid
        };
        util.getOnlyProp(users, data.foreignIot.uid, ['id']);
        util.getOnlyProp(items, data.foreignIot.items, ['id']);
        util.getOnlyProp(users, data.iotOwner.uid, ['id']);
        util.getOnlyProp(items, data.iotOwner.items, ['id']);
        return db.userOp.update({
          _id: {
            $in: users
          }
        }, {
          $pull: {
            hasContracts: ctid
          }
        }, {
          multi: true
        });
      } catch(err) {
        // Case missing some fields for update
        Promise.reject({continue: true, message: "Contract " + JSON.stringify(obj.queryId) + " old schema or incomplete"});
      }
    })
    .then(function(response) {
      return db.itemOp.update({
        _id: {
          $in: items
        }
      }, {
        $pull: {
          hasContracts: ctid
        }
      }, {
        multi: true
      });
    })
    .then(function(response) {
      if (obj.token_uid && obj.token_mail) {
        try{
          obj.id = data._id;
          obj.ctid = data.ctid;
          obj.ownUsers = data.iotOwner.uid;
          obj.foreignUsers = data.foreignIot.uid;
          obj.imAdmin = true;
          obj.type = "DELETE";
          return util.createNotifAndAudit(obj, funcs); // Accepted = true
        } catch(err) {
          Promise.resolve("Finish without notification");
        }
      } else {
        Promise.resolve("Finish without notification");
      }
    })
    .then(function(response) {
      return Promise.resolve(response);
    })
    .catch(function(err) {
      if(err.continue){
        return Promise.resolve(err.message);
      } else {
        return Promise.reject(err);
      }
    });
};


// Private Functions

/**
Remove a user in a contract
* @return {Promise}
*/
function removeOneUser(req, res, imForeign) {
  var uid = req.body.decoded_token.uid;
  var mail = req.body.decoded_token.sub;
  var items = [];
  var items_id = [];
  var items_oid = [];
  var query = {};
  var ctid;
  var data = {};
  var obj = {};
  // Build pulling ct query based on if service owner or not
  if (imForeign) {
    query = {
      $pull: {
        "foreignIot.uid": {
          id: uid
        }
      }
    };
  } else {
    query = {
      $pull: {
        "iotOwner.uid": {
          id: uid
        }
      }
    };
  }
  // Start process
  return db.contractOp.findOneAndUpdate(obj.queryId, query, {
      new: true
    }).lean()
    .then(function(response) {
      if(!response){
        Promise.reject({continue: true, message: "Contract " + JSON.stringify(obj.queryId) + " does not exist"});
      } else {
        id = response._id; // Recover _id (Case original input was ctid)
        ctid = response.ctid;
        data = response;
        if (imForeign) {
          util.getOnlyProp(items, response.foreignIot.items, ['id']);
        } else {
          util.getOnlyProp(items, response.iotOwner.items, ['id']);
        }
        return db.itemOp.find({
          "_id": {
            $in: items
          },
          'uid.id': uid
        }, {
          oid: 1
        });
      }
    })
    .then(function(response) {
      try{
        util.getOnlyProp(items_id, response, ['_id']);
        util.getOnlyProp(items_oid, response, ['oid']);
        if (imForeign) {
          query = {
            $pull: {
              "foreignIot.items": {
                id: {
                  $in: items_id
                }
              }
            }
          };
        } else {
          query = {
            $pull: {
              "iotOwner.items": {
                id: {
                  $in: items_id
                }
              }
            }
          };
        }
        return db.contractOp.update(obj.queryId, query, {
          multi: true
        });
      } catch(err) {
        // Case missing some fields for update
        Promise.reject({continue: true, message: "Contract " + JSON.stringify(obj.queryId) + " old schema or incomplete"});
      }
    })
    .then(function(response) {
      return db.userOp.update({
        _id: uid
      }, {
        $pull: {
          hasContracts: {
            id: id
          }
        }
      });
    })
    .then(function(response) {
      return db.itemOp.update({
        _id: {
          $in: items_id
        }
      }, {
        $pull: {
          hasContracts: {
            id: id
          }
        }
      }, {
        multi: true
      });
    })
    .then(function(response) {
      obj.ctid = ctid;
      obj.token_mail = mail;
      obj.items = items_oid;
      obj.add = false;
      return util.moveItemsInContract(obj, db, funcs); // add = false
    })
    .then(function(response) {
      try{
        obj.ct_id = data._id;
        obj.ctid = data.ctid;
        obj.token_uid = uid;
        obj.token_mail = mail;
        obj.ownUsers = data.iotOwner.uid;
        obj.foreignUsers = data.foreignIot.uid;
        obj.imAdmin = false;
        obj.type = "DELETE";
        return util.createNotifAndAudit(obj, funcs); // Accepted = true
      } catch(err) {
        Promise.resolve("Finish without notification");
      }
    })
    .then(function(response) {
      return Promise.resolve(response);
    })
    .catch(function(err) {
      if(err.continue){
        return Promise.resolve(err.message);
      } else {
        return Promise.reject(err);
      }
    });
}

// Export module
module.exports = removeModule;
