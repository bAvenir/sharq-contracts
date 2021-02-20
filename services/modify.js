var util = require('../util/util'); // Cross-domain functions
var mgmtSemanticRepo = require('../services/semantic'); // Semantic Repository
var ctChecks = require('./checks');
var modifyModule = {};

/*
When an item is updated we need to put them in "hold" the contracts
1 - Remove from ct comm server groups
2 - Set in item in all contracts approved=false
3 - Add flag in user contract instance with the "inactive" items
4 - Create notifications and logs
*/
modifyModule.pauseContracts = function(ctData, req, res, db, funcs, callback) {
  var oid, ct, uid;
  if (ctData && ctData.ct.length > 0) {
    oid = ctData.oid;
    ct = ctData.ct;
    uid = ctData.uid;
  } else {
    oid = req.body.oid;
    ct = req.body.ct;
    uid = req.body.uid;
  }
  var cts = [];
  if (ct.constructor === Array) {
    cts = ct;
  } else {
    cts.push(ct);
  }
  if (cts.length > 0) { // Check if there is any item to delete
     funcs.sync.forEachAll(cts,
      function(value, allresult, next, otherParams) {
        // Add inactive items to user contract item
        db.userOp.update({
            "_id": uid.id,
            "hasContracts.extid": value.extid
          }, {
            $push: {
              "hasContracts.$.inactive": oid.extid
            }
          })
          .then(function(response) {
            util.deletingOne(otherParams.oid, {
              mail: otherParams.mail,
              ctid: value.extid
            }, req, res, funcs, function(value, result) {
              allresult.push({
                value: oid.extid,
                result: result
              });
              next();
            });
          })
          .catch(function(error) {
            allresult.push({
              value: value.extid,
              result: error
            });
            next();
          });
      },
      function(allresult) {
        if (allresult.length === cts.length) {
          var ct_oids = [];
          util.getOnlyProp(ct_oids, cts, ['extid']);
          return db.itemOp.findOne({
              "_id": oid.id
            })
            .then(function(response) {
              // Set to approved false all contracts in an inactive item
              for (var i = 0, l = response.hasContracts.length; i < l; i++) {
                if (ct_oids.indexOf(response.hasContracts[i].extid) !== -1) {
                  response.hasContracts[i].approved = false;
                }
              }
              return response.save();
            })
            .then(function(response) {
              // Only set to inactive infrastructure --> Service would reset whole contract
              return db.contractOp.update({
                "ctid": {
                  $in: ct_oids
                },
                "iotOwner.items.id": oid.id
              }, {
                $set: {
                  "iotOwner.items.$.inactive": true
                }
              }, {
                multi: true
              });
            })
            .then(function(response) {
              var semRepoUpd = [];
              for (var i = 0, l = ct_oids.length; i < l; i++) {
                semRepoUpd.push(mgmtSemanticRepo(ct_oids[i], "create", db, funcs));
              }
              return Promise.all(semRepoUpd);
            })
            .then(function(response) {
              var toNotif = [];
              for (var i = 0, l = cts.length; i < l; i++) {
                toNotif.push(funcs.notifHelper.createNotification({
                    kind: 'item',
                    item: oid.id,
                    extid: oid.extid
                  }, {
                    kind: 'user',
                    item: uid.id,
                    extid: uid.extid
                  }, {
                    kind: 'contract',
                    item: cts[i].id,
                    extid: cts[i].extid
                  },
                  'info', 26, null));
              }
              return Promise.all(toNotif);
            })
            .then(function(response) {
              for (var i = 0, l = cts.length; i < l; i++) {
                funcs.audits.create({
                    kind: 'user',
                    item: uid.id,
                    extid: uid.extid
                  }, {}, {
                    kind: 'contract',
                    item: cts[i].id,
                    extid: cts[i].extid
                  },
                  56, "Item " + oid.extid + " disabled");
              }
              return Promise.resolve(true);
            })
            .then(function(response) {
              funcs.logger.debug('Disabling item in contract(s): ' + oid.extid);
              callback(false, {
                toPause: allresult
              });
            })
            .catch(function(err) {
              callback(true, err);
            });
        }
      },
      false, {
        oid: oid.extid,
        mail: uid.extid
      }
    );
  } else {
    funcs.logger.warn({
      user: uid.extid,
      action: 'removeItemFromContract',
      message: "No items to be removed"
    });
    callback(false, {
      toPause: "Nothing to be removed..."
    });
  }
};

/*
Reactivate ONE item in ONE contract after update
1 - Add to ct comm server groups
2 - Set ONE item in ONE contract approved=true
3 - Remove item from flags in user contract "inactive" items
4 - Create notifications and logs
*/
modifyModule.enableOneItem = function(req, res, db, funcs) {
  var oid = req.body.oid;
  var ct = req.body.ct;
  var uid = req.body.uid;
  var otherData = {
    ctid: ct.extid,
    mail: uid.extid
  };
  return util.addingOne(oid, otherData, req, res, db, funcs, function(err, response) {
      if (err) return Promise.reject(err);
      return Promise.resolve(response);
    })
    .then(function(response) {
      return db.itemOp.update({
        "oid": oid,
        "hasContracts.extid": ct.extid
      }, {
        $set: {
          "hasContracts.$.approved": true
        }
      });
    })
    .then(function(response) {
      return db.userOp.update({
        "_id": uid.id,
        "hasContracts.extid": ct.extid
      }, {
        $pull: {
          "hasContracts.$.inactive": oid
        }
      });
    })
    .then(function(response) {
      return mgmtSemanticRepo(ct.extid, "create", db, funcs);
    })
    .then(function(response) {
      return funcs.audits.create({
          kind: 'user',
          item: uid.id,
          extid: uid.extid
        }, {}, {
          kind: 'contract',
          item: ct.id,
          extid: ct.extid
        },
        56, "Item " + oid + " enabled");
    })
    .then(function(response) {
      funcs.logger.debug('Enabling item from contract(s): ' + oid);
      return Promise.resolve('Success');
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
};

/*
Remove ONE item from contract
1 - Remove from ct comm server groups
2 - Pull contract object from item
3 - Pull item from user contract obj inactives (just in case)
4 - Pull item from contract
5 - Create notifications and logs (Deleting one function)
*/
modifyModule.removeOneItem = function(req, res, db, funcs) {
  var oid = req.body.oid;
  var ct = req.body.ct;
  var uid = req.body.uid;
  var otherData = {
    ctid: ct.extid,
    mail: uid.extid
  };
  return util.deletingOne(oid, otherData, req, res, funcs, function(err, response) {
      if (err) return Promise.reject(err);
      return Promise.resolve(response);
    })
    .then(function(response) {
      return db.itemOp.update({
        "oid": oid
      }, {
        $pull: {
          hasContracts: {
            extid: ct.extid
          }
        }
      });
    })
    .then(function(response) {
      return db.userOp.update({
        "_id": uid.id,
        "hasContracts.extid": ct.extid
      }, {
        $pull: {
          "hasContracts.$.inactive": oid
        }
      });
    })
    .then(function(response) {
      return db.contractOp.update({
        "ctid": ct.extid
      }, {
        $pull: {
          "foreignIot.items": {
            extid: oid
          }
        }
      });
    })
    .then(function(response) {
      return db.contractOp.update({
        "ctid": ct.extid
      }, {
        $pull: {
          "iotOwner.items": {
            extid: oid
          }
        }
      });
    })
    .then(function(response) {
      return ctChecks.contractValidity([ct.extid], uid.id, uid.extid, db, funcs);
    })
    .then(function(response) {
      return mgmtSemanticRepo(ct.extid, "create", db, funcs);
    })
    .then(function(response) {
      return funcs.audits.create({
          kind: 'user',
          item: uid.id,
          extid: uid.extid
        }, {}, {
          kind: 'contract',
          item: ct.id,
          extid: ct.extid
        },
        56, "Item " + oid + " removed");
    })
    .then(function(response) {
      funcs.logger.debug('Delete item from contract(s): ' + oid);
      return Promise.resolve('Success');
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
};

/*
Restart contract, when a service gets updated
1 - Remove contract
2 - Create contract with same specs
3 - Create notifications and logs
*/
modifyModule.resetContract = function(cts, uid, db, funcs, callback) {
    if (cts.length > 0) { // Check if there is any item to delete
      funcs.sync.forEachAll(cts,
        function(value, allresult, next, otherParams) {
          var contractData = {};
          var uidService = [];
          var idsService = [];
          var uidDevice = [];
          var idsDevice = [];
          var items = [];
          var users = [];
          db.contractOp.findOne({
              ctid: value.extid
            }).lean()
            .then(function(response) {
              // Set item has contract inactive to true
              for (var i = 0, l = response.iotOwner.items.length; i < l; i++) {
                response.iotOwner.items[i].inactive = true;
              }
              for (var j = 0, k = response.foreignIot.items.length; j < k; j++) {
                response.foreignIot.items[j].inactive = true;
              }
              // Gather contract data
              try {
                contractData = response;
                util.getOnlyProp(uidService, contractData.foreignIot.uid, ['id']);
                util.getOnlyProp(idsService, contractData.foreignIot.items, ['id']);
                util.getOnlyProp(uidDevice, contractData.iotOwner.uid, ['id']);
                util.getOnlyProp(idsDevice, contractData.iotOwner.items, ['id']);
                users = uidService.concat(uidDevice);
                items = idsService.concat(idsDevice);
              } catch (err) {
                allresult.push({
                  value: value.extid,
                  result: err
                });
                next();
              }
              // Save contract with changes (items inactive = true)
              return response.save();
            })
            .then(function(response) {
              // Remove Contract group in comm server
              return util.cancelContract(value.extid, db, funcs);
            })
            .then(function(response) {
              // Add contract group in comm server
              return util.createContract(value.extid, 'Contract: ' + contractData.type, funcs);
            })
            .then(function(response) {
              return db.userOp.update({
                _id: {
                  $in: users
                },
                "hasContracts.extid": contractData.ctid
              }, {
                $set: {
                  "hasContracts.$.approved": false
                }
              }, {
                multi: true
              });
            })
            .then(function(response) {
              return db.itemOp.update({
                _id: {
                  $in: items
                },
                "hasContracts.extid": contractData.ctid
              }, {
                $set: {
                  "hasContracts.$.approved": false
                }
              }, {
                multi: true
              });
            })
            .then(function(response) {
              query = {
                $set: {
                  "foreignIot.termsAndConditions": false,
                  "iotOwner.termsAndConditions": false
                }
              };
              return db.contractOp.update({
                "_id": contractData._id
              }, query);
            })
            .then(function(response) {
              var obj = {};
              obj.ct_id = contractData._id;
              obj.ctid = contractData.ctid;
              obj.token_uid = uid.id;
              obj.token_mail = uid.extid;
              obj.ownUsers = contractData.iotOwner.uid;
              obj.foreignUsers = contractData.foreignIot.uid;
              obj.imAdmin = true;
              obj.type = "UPDATE";
              return util.createNotifAndAudit(obj, funcs); // Accepted = true
            })
            .then(function(response) {
              allresult.push({
                value: value.extid,
                result: 'Success'
              });
              next();
            })
            .catch(function(err) {
              allresult.push({
                value: value.extid,
                result: err
              });
              next();
            });
        },
        function(allresult) {
          if (allresult.length === cts.length) {
            callback(false, {
              toReset: allresult
            });
          }
        },
        false, {
          uid: uid
        }
      );
    } else {
      // logger.warn({user:uid.extid, action: 'updateContract', message: "No contracts to be updated"});
      callback(false, {
        toReset: "Nothing to be removed..."
      });
    }
};

// Public Functions
module.exports = modifyModule;
