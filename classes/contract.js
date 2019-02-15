// Global packages
var uuid = require('uuid/v4'); // Unique ID RFC4122 generator

// Private
function getCtid(ctid) {
  var out = ctid === undefined ? uuid() : ctid;
  return out;
}

// Public Constructor

/*
Initializes the contract object with the user input data
*/

module.exports = Contract;

function Contract(data) {
  this.ctid = getCtid(data.ctid);
  this.foreignIot = {
    cid: data.cidService,
    uid: data.uidsService,
    termsAndConditions: false,
    items: data.oidsService
  };
  this.iotOwner = {
    cid: data.cidDevice,
    uid: data.uidsDevice,
    termsAndConditions: true,
    items: data.oidsDevice
  };
  this.readWrite = data.readWrite;
  this.legalDescription = 'lorem ipsum';
  this.type = 'serviceRequest';
}
