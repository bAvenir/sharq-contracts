var util = require('../util/util'); // Cross-domain functions
var Contract = require('../classes/contract'); // Initialize contract object
var Create = require('../classes/create'); // Initialize contract object

/**
Create a contract request
* @return {Callback}
*/
var create = module.exports = function(req, res, db, funcs) {
  var data = req.body;

  // User id and mail
  var token_uid = req.body.decoded_token.uid;
  var token_mail = req.body.decoded_token.sub;

  //Building contract object
  var ct_obj = new Contract(data);
  var ct = new db.contractOp(ct_obj); // Create contract mongo obj

  //Initialize Create class
  var createClass = new Create(data);

  // Save contract object in Mongo
  return ct.save()
    .then(function(response) {
      try {
        // Update create class with contract data
        createClass.build(data, response, token_uid);
        return Promise.resolve(true);
      } catch (err) {
        return Promise.reject(err);
      }
    })
    // Update items and users involved in the contract
    .then(function(response) {
      return db.userOp.update({
        _id: {
          $in: createClass.uidDevice
        }
      }, {
        $push: {
          hasContracts: createClass.ctidDeviceUser
        }
      }, {
        multi: true
      });
    })
    .then(function(response) { // Update main requester
      return db.userOp.update({
        _id: token_uid,
        "hasContracts.id": createClass.ct_id
      }, {
        $set: {
          "hasContracts.$.imAdmin": true,
          "hasContracts.$.approved": true
        }
      });
    })
    .then(function(response) {
      return db.itemOp.update({
        _id: {
          $in: createClass.idsDevice
        }
      }, {
        $push: {
          hasContracts: createClass.ctidDeviceItem
        }
      }, {
        multi: true
      });
    })
    .then(function(response) {
      return db.userOp.update({
        _id: {
          $in: createClass.uidService
        }
      }, {
        $push: {
          hasContracts: createClass.ctidServiceUser
        }
      }, {
        multi: true
      });
    })
    .then(function(response) { // Update main provider
      return db.userOp.update({
        _id: createClass.contractingUser.id,
        "hasContracts.id": createClass.ct_id
      }, {
        $set: {
          "hasContracts.$.imAdmin": true
        }
      });
    })
    .then(function(response) {
      return db.itemOp.update({
        _id: {
          $in: createClass.idsService
        }
      }, {
        $push: {
          hasContracts: createClass.ctidServiceItem
        }
      }, {
        multi: true
      });
    })
    .then(function(response) {
      // Create contract group in comm server
      return util.createContract(createClass.ctid, 'Contract: ' + createClass.ct_type, funcs);
    })
    .then(function(response) {
      // Get contract creator devices -- To add in contract because we assume that contract requester agrees terms
      return db.itemOp.find({
        "_id": {
          $in: createClass.idsDevice
        },
        'uid.id': token_uid
      }, {
        oid: 1
      });
    })
    .then(function(response) {
      var items = [];
      // Get OID of devices to be enabled in contract
      util.getOnlyProp(items, response, ['oid']);
      // Add items in contract group of comm server
      var data = {};
      data.ctid = createClass.ctid;
      data.token_mail = token_mail;
      data.items = items;
      data.add = true;
      return util.moveItemsInContract(req, res, data, db, funcs); // add = true
    })
    .then(function(response) {
      return funcs.notifHelper.createNotification({
          kind: 'user',
          item: token_uid,
          extid: token_mail
        }, {
          kind: 'user',
          item: createClass.contractingUser.id,
          extid: createClass.contractingUser.extid
        }, {
          kind: 'contract',
          item: createClass.ct_id,
          extid: createClass.ctid
        },
        'info', 21, null);
    })
    .then(function(response) {
      return funcs.audits.create({
          kind: 'user',
          item: token_uid,
          extid: token_mail
        }, {
          kind: 'user',
          item: createClass.contractingUser.id,
          extid: createClass.contractingUser.extid
        }, {
          kind: 'contract',
          item: createClass.ct_id,
          extid: createClass.ctid
        },
        51, null);
    })
    .then(function(response) {
      funcs.logger.log(req, res, {
        type: 'audit',
        data: 'Contract posted, waiting for approval'
      });
      return Promise.resolve('Contract posted, waiting for approval');
    })
    .catch(function(err) {
      return Promise.reject(err);
    });

};
