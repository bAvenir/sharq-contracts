var semantic = require('../services/semantic'); // Semantic Repository

/*
Extract one field per object in array
Output: array of strings
*/
function getOnlyProp(items, toAdd, properties) {
  var aux;
  for (var i = 0, l = toAdd.length; i < l; i++) {
    aux = toAdd[i];
    for (var j = 0, k = properties.length; j < k; j++) {
      aux = aux[properties[j]];
    }
    items.push(aux);
  }
}


/*
Start contract group in commServer
*/
function createContract(id, descr, funcs) {
  var payload = {
    name: id,
    description: descr
  };
  return funcs.commServer.callCommServer(payload, 'groups', 'POST');
}

/*
Add or remove items to the contract
*/
function moveItemsInContract(req, res, obj, db, funcs) {
  if (obj.items.length > 0) { // Check if there is any item to delete
    funcs.sync.forEachAll(obj.items,
      function(value, allresult, next, otherParams) {
        if (obj.add) {
          addingOne(value, otherParams, req, res, db, funcs, function(value, result) {
            allresult.push({
              value: value,
              result: result
            });
            next();
          });
        } else {
          deletingOne(value, otherParams, req, res, funcs, function(value, result) {
            allresult.push({
              value: value,
              result: result
            });
            next();
          });
        }
      },
      function(allresult) {
        if (allresult.length === obj.items.length) {
          return semantic.mgmtSemanticRepo(obj.ctid, "create", db, funcs)
            .then(function(response) {
              return Promise.resolve({
                "error": false,
                "message": allresult
              });
            })
            .catch(function(err) {
              return Promise.resolve({
                "error": true,
                "message": allresult
              });
            });
        }
      },
      false, {
        ctid: obj.ctid,
        mail: obj.token_mail
      }
    );
  } else {
    if (obj.add) {
      funcs.logger.log(req, res, {
        type: 'warn',
        data: {
          user: obj.token_mail,
          action: 'addItemToContract',
          message: "No items to be added"
        }
      });
      return Promise.resolve({
        "error": false,
        "message": "Nothing to be added..."
      });
    } else {
      funcs.logger.log(req, res, {
        type: 'warn',
        data: {
          user: obj.token_mail,
          action: 'removeItemFromContract',
          message: "No items to be removed"
        }
      });
      return Promise.resolve({
        "error": false,
        "message": "Nothing to be removed..."
      });
    }
  }
}

/*
Add items to contract group in commServer
Extends to moveItemsInContract
*/
function addingOne(oid, otherParams, req, res, db, funcs, callback) {
  db.itemOp.updateOne({
      "oid": oid,
      "hasContracts.extid": otherParams.ctid
    }, {
      $set: {
        "hasContracts.$.approved": true
      }
    })
    .then(function(response) {
      return db.contractOp.update({
        "iotOwner.items.extid": oid,
        ctid: otherParams.ctid
      }, {
        $set: {
          "iotOwner.items.$.inactive": false
        }
      });
    })
    .then(function(response) {
      return db.contractOp.update({
        "foreignIot.items.extid": oid,
        ctid: otherParams.ctid
      }, {
        $set: {
          "foreignIot.items.$.inactive": false
        }
      });
    })
    .then(function(response) {
      return funcs.commServer.callCommServer({}, 'users/' + oid + '/groups/' + otherParams.ctid, 'POST');
    })
    .then(function(response) {
      funcs.logger.log(req, res, {
        type: "audit",
        data: {
          user: otherParams.mail,
          action: 'addItemToContract',
          item: oid,
          contract: otherParams.ctid
        }
      });
      callback(oid, "Success");
    })
    .catch(function(err) {
      if (err.statusCode !== 404) {
        callback(oid, 'Error: ' + err);
      } else {
        funcs.logger.log(req, res, {
          type: "audit",
          data: {
            user: otherParams.mail,
            action: 'addItemToContract',
            item: oid,
            contract: otherParams.ctid
          }
        });
        callback(oid, "Success");
      }
    });
}


/*
Remove items from contract group in commServer
Extends to moveItemsInContract
*/
function deletingOne(oid, otherParams, req, res, funcs, callback) {
  funcs.commServer.callCommServer({}, 'users/' + oid + '/groups/' + otherParams.ctid, 'DELETE')
    .then(function(response) {
      funcs.logger.log(req, res, {
        type: "audit",
        data: {
          user: otherParams.mail,
          action: 'removeItemFromContract',
          item: oid,
          contract: otherParams.ctid
        }
      });
      callback(oid, "Success");
    })
    .catch(function(err) {
      if (err.statusCode !== 404) {
        callback(oid, err);
      } else {
        funcs.logger.log(req, res, {
          type: "audit",
          data: {
            user: otherParams.mail,
            action: 'removeItemFromContract',
            item: oid,
            contract: otherParams.ctid
          }
        });
        callback(oid, "Success");
      }
    });
}



// Export public functions

module.exports = {
  getOnlyProp: getOnlyProp,
  createContract: createContract,
  moveItemsInContract: moveItemsInContract
};
