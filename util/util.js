var mgmtSemanticRepo = require('../services/semantic'); // Semantic Repository

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
Remove contract group in commServer
*/
function cancelContract(id, db, funcs) {
  return funcs.commServer.callCommServer({}, 'groups/' + id, 'DELETE')
    .then(function(response) {
      return mgmtSemanticRepo(id, "delete", db, funcs);
    })
    .catch(function(err) {
      if (err.statusCode !== 404) {
        return Promise.reject(err);
      } else {
        return Promise.resolve(true);
      }
    });
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
          return mgmtSemanticRepo(obj.ctid, "create", db, funcs)
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
      funcs.logger.warn({
        user: obj.token_mail,
        action: 'addItemToContract',
        message: "No items to be added"
      });
      return Promise.resolve({
        "error": false,
        "message": "Nothing to be added..."
      });
    } else {
      funcs.logger.warn({
        user: obj.token_mail,
        action: 'removeItemFromContract',
        message: "No items to be removed"
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
  return db.itemOp.updateOne({
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
      funcs.logger.audit({
        user: otherParams.mail,
        action: 'addItemToContract',
        item: oid,
        contract: otherParams.ctid
      });
      callback(oid, "Success");
    })
    .catch(function(err) {
      if (err.statusCode !== 404) {
        callback(oid, 'Error: ' + err);
      } else {
        funcs.logger.audit({
          user: otherParams.mail,
          action: 'addItemToContract',
          item: oid,
          contract: otherParams.ctid
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
  return funcs.commServer.callCommServer({}, 'users/' + oid + '/groups/' + otherParams.ctid, 'DELETE')
    .then(function(response) {
      funcs.logger.audit({
        user: otherParams.mail,
        action: 'removeItemFromContract',
        item: oid,
        contract: otherParams.ctid
      });
      callback(oid, "Success");
    })
    .catch(function(err) {
      if (err.statusCode !== 404) {
        callback(oid, err);
      } else {
        funcs.logger.audit({
            user: otherParams.mail,
            action: 'removeItemFromContract',
            item: oid,
            contract: otherParams.ctid
        });
        callback(oid, "Success");
      }
    });
}

/*
Create notifications
*/
function createNotifAndAudit(obj, funcs) {
  var auditNumber;
  var notifNumber;
  var notifTarget = [];
  var message = null;
  try {
    var allUsers = obj.ownUsers.concat(obj.foreignUsers);
    for (var n = 0; n < allUsers.length; n++) {
      notifTarget.push({
        kind: 'user',
        item: allUsers[n].id,
        extid: allUsers[n].extid
      });
    }

    if (obj.imAdmin && obj.type === "ACCEPT") {
      notifNumber = 22;
      auditNumber = 52;
    } else if (!obj.imAdmin && obj.type === "ACCEPT") {
      notifNumber = 24;
      auditNumber = 54;
    } else if (obj.imAdmin && obj.type === "DELETE") {
      notifNumber = 23;
      auditNumber = 53;
    } else if (!obj.imAdmin && obj.type === "DELETE") {
      notifNumber = 25;
      auditNumber = 55;
    } else if (obj.type === "UPDATE") {
      notifNumber = 26;
      auditNumber = 56;
      message = "Reset contract";
    } else {
      return Promise.resolve(false);
    }

    // Asynchronously notify all allUsers
    // Ignore response
    var toNotify = [];
    for (var i = 0; i < notifTarget.length; i++) {
      toNotify.push(funcs.notifHelper.createNotification({
          kind: 'user',
          item: obj.token_uid,
          extid: obj.token_mail
        },
        notifTarget[i], {
          kind: 'contract',
          item: obj.ct_id,
          extid: obj.ctid
        },
        'info', notifNumber, message
      ));
    }
    return Promise.all(toNotify)
      .then(function(response) {
        return funcs.audits.create({
            kind: 'user',
            item: obj.token_uid,
            extid: obj.token_mail
          }, {}, {
            kind: 'contract',
            item: obj.ct_id,
            extid: obj.ctid
          },
          auditNumber, message);
      })
      .then(function(response) {
        return Promise.resolve(true);
      })
      .catch(function(err) {
        return Promise.reject(err);
      });
  } catch (err) {
    return Promise.resolve(true);
  }
}

/**
 * Looks for the user id in the contracts
 * @return {Boolean}
 */
function uidInContract(uid, data) {
  var array = [];
  array = data.iotOwner.uid;
  array = array.concat(data.foreignIot.uid);
  for (var i = 0, l = array.length; i < l; i++) {
    if (uid === array[i].id.toString()) {
      return true;
    }
  }
  return false;
}

// Get id if a condition is met
function getOnlyIdCondition(items, toAdd) {
  for (var i = 0; i < toAdd.length; i++) {
    if (!toAdd[i].imAdmin) {
      items.push(toAdd[i].id);
    }
  }
}

// Export public functions

module.exports = {
  getOnlyProp: getOnlyProp,
  createContract: createContract,
  cancelContract: cancelContract,
  moveItemsInContract: moveItemsInContract,
  createNotifAndAudit: createNotifAndAudit,
  uidInContract: uidInContract,
  getOnlyIdCondition: getOnlyIdCondition,
  addingOne: addingOne,
  deletingOne: deletingOne
};
