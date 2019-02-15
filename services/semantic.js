/**
 * Manages contracts in semanticRepo
 * Adds or removes a contract
 * PUBLIC FUNCTION
 * @params{ ctid action(create, delete) }
 * @return Object{result}
 */
 var mgmtSemanticRepo = module.exports = function(id, action, db, funcs) {
  return payloadSemanticRepo(id, action, db)
    .then(function(response) {
      if(!response){
        return Promise.resolve("Nothing was created in Semantic Repository");
      } else {
        var body = response.body;
        var type = response.action;
        return funcs.semanticRepo.callSemanticRepo(body, "contracts/" + type, "POST");
      }
    })
    .then(function(response) {
      return Promise.resolve(response);
    })
    .catch(function(err) {
      return Promise.reject(err);
    });
};

/*
* Private functions
*/

// Get payload for creating/deleting the contract instance in semanticRepo
function payloadSemanticRepo(id, action, db) {
  var result = {};
  var body;
  if (action === "create") {
    return db.contractOp.find({
        ctid: id
      }, {
        readWrite: 1,
        foreignIot: 1,
        iotOwner: 1
      })
      .then(function(response) {
        var petitioner_items = [];
        if(response[0].foreignIot.items.length !== 0 && response[0].foreignIot.items[0].inactive) {
          Promise.resolve(false);
        } else {
          getOnlyPropCt(petitioner_items, response[0].iotOwner.items);
          if (petitioner_items.length === 0 || response[0].foreignIot.items.length === 0) {
            result.body = [id];
            result.action = "delete";
            return Promise.resolve(result);
          } else {
            result.body = [{
              contract_id: id,
              write_rights: response[0].readWrite,
              requested_service: response[0].foreignIot.items[0].extid,
              petitioner_items: petitioner_items,
              service_owner: response[0].foreignIot.cid.extid,
              service_petitioner: response[0].iotOwner.cid.extid
            }];
            result.action = "create";
            return Promise.resolve(result);
          }
        }
      })
      .catch(function(err) {
        return Promise.reject(err);
      });
  } else {
    result.body = [id];
    result.action = "delete";
    return Promise.resolve(result);
  }
}

/*
Extract one field per object in array
Output: array of strings
Note: Specialized for the contract items
*/
function getOnlyPropCt(items, toAdd) {
  for (var i = 0, l = toAdd.length; i < l; i++) {
    if(!toAdd[i].inactive) items.push(toAdd[i].extid);
  }
}
