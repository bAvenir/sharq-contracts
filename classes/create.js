// Private
function getOnlyId(items, toAdd) {
  for (var i = 0, l = toAdd.length; i < l; i++) {
    items.push(toAdd[i].id);
  }
}

function setContractingUser(data) {
  var out = data.contractingUser === undefined ? data.uidsService[0] : data.contractingUser;
  return out;
}

// Public Constructor

/*
Contains all data for creating a create contract request
Has info to be added to items and users involved in the contract
*/

module.exports = Create;

function Create(data) {
  this.ct_id = ""; // Contract id internal
  this.ctid = ""; // Contract id external
  this.ct_type = ""; // Contract type
  this.idsService = []; // store internal ids services
  this.idsDevice = []; // store internal ids devices
  this.uidService = []; // store internal ids services owners
  this.uidDevice = []; // store internal ids devices owners
  this.cidService = data.cidService.extid; // External id of service prov organisation
  this.cidDevice = data.cidDevice.extid; // External id of iot owner organisation

  // Case contracting user not provided, assume it is the first in the array of contracted service
  this.contractingUser = setContractingUser(data);

  // Other contract sub-schemas
  this.ctidDeviceUser = {};
  this.ctidDeviceItem = {};
  this.ctidServiceUser = {};
  this.ctidServiceItem = {};
}

// Public methods

Create.prototype.build = function(data, response, token_uid) {

  this.ct_id = response._id;
  this.ctid = response.ctid;
  this.ct_type = response.type;

  this.ctidServiceItem = {
    id: response._id,
    extid: response.ctid,
    contractingParty: data.cidDevice.id,
    contractingUser: token_uid,
    approved: false,
    readWrite: response.readWrite,
    imForeign: true
  };

  this.ctidServiceUser = {
    id: response._id,
    extid: response.ctid,
    contractingParty: data.cidDevice.id,
    contractingUser: token_uid,
    approved: false,
    readWrite: response.readWrite,
    imForeign: true
  };

  // If only one requester we asume that it is provinding all items itself, therefore the contract and its items are approved by default
  this.ctidDeviceItem = {
    id: response._id,
    extid: response.ctid,
    contractingParty: data.cidService.id,
    contractingUser: this.contractingUser.id,
    approved: data.uidsDevice.length === 1,
    readWrite: response.readWrite
  };

  this.ctidDeviceUser = {
    id: response._id,
    extid: response.ctid,
    contractingParty: data.cidService.id,
    contractingUser: this.contractingUser.id,
    approved: false,
    readWrite: response.readWrite
  };

  // Get internal ids
  getOnlyId(this.uidService, data.uidsService);
  getOnlyId(this.idsService, data.oidsService);
  getOnlyId(this.uidDevice, data.uidsDevice);
  getOnlyId(this.idsDevice, data.oidsDevice);

};
