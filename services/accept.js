var util = require('../util/util'); // Cross-domain functions

/**
Accept a contract request
Input id (MONGO) or CTID, both supported
* @return {Callback} With updItem
*/
var accept = module.exports = function(obj, req, res, db, funcs) {

// User id and mail
var token_uid = req.body.decoded_token.uid;
var token_mail = req.body.decoded_token.sub;

// Update query contract
obj.queryContract._id = token_uid;

var imAdmin = null;
var imForeign = null;
var updItem = {};
var items = [];
var query = {};

return db.userOp.findOneAndUpdate(obj.queryContract, {
    $set: {
      "hasContracts.$.approved": true,
      "hasContracts.$.inactive": []
    }
  }, {
    new: true
  })
  .then(function(response) {
    for (var i = 0; i < response.hasContracts.length; i++) {
      if (response.hasContracts[i].id.toString() === obj.id.toString() || response.hasContracts[i].extid === obj.id) {
        imAdmin = response.hasContracts[i].imAdmin;
        imForeign = response.hasContracts[i].imForeign;
      }
    }
    if (imAdmin && imForeign) {
      query = {
        $set: {
          "foreignIot.termsAndConditions": true
        }
      };
      return db.contractOp.findOneAndUpdate(obj.queryId, query, {
        new: true
      });
    } else if (imAdmin && !imForeign) {
      query = {
        $set: {
          "iotOwner.termsAndConditions": true
        }
      };
      return db.contractOp.findOneAndUpdate(obj.queryId, query, {
        new: true
      }).lean();
    } else {
      return db.contractOp.findOne(obj.queryId).lean();
    }
  })
  .then(function(response) {
    updItem = response;
    if (imForeign) {
      util.getOnlyProp(items, updItem.foreignIot.items, ['id']);
    } else {
      util.getOnlyProp(items, updItem.iotOwner.items, ['id']);
    }
    return db.itemOp.find({
      "_id": {
        $in: items
      },
      'uid.id': token_uid
    }, {
      oid: 1
    });
  })
  .then(function(response) {
    items = [];
    util.getOnlyProp(items, response, ['oid']);
    obj.ctid = updItem.ctid;
    obj.token_mail = token_mail;
    obj.items = items;
    obj.add = true;
    return util.moveItemsInContract(req, res, obj, db, funcs); // add = true
  })
  .then(function(response) {
    obj.ct_id = updItem._id;
    obj.token_uid = token_uid;
    obj.ownUsers = updItem.iotOwner.uid;
    obj.foreignUsers = updItem.foreignIot.uid;
    obj.imAdmin = imAdmin;
    obj.type = 'ACCEPT';
    return util.createNotifAndAudit(obj, funcs); // Accepted = true
  })
  .then(function(response) {
    funcs.logger.audit('Contract accepted');
    Promise.resolve(updItem);
  })
  .catch(function(err){
    Promise.reject(err);
  });
};
