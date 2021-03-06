var hid = require('node-hid');

module.exports = {
  getDevices: nodeGetDevices,
  connect: nodeConnect,
  send: nodeSend,
  sendFeatureReport: nodeSendFeatureReport,
  receive: nodeReceive,
  disconnect: nodeDisconnect
};

function nodeGetDevices (options, cb) {
  var ret = [];
  options.filters.forEach(function (filter) {
    try {
      var devices = hid.devices(filter.vendorId, filter.productId);
      devices = devices.sort(function (a, b) { return a.interface > b.interface; });
      ret = ret.concat(devices);
    } catch (e) {
      console.log(e);
    }
  });
  ret.forEach(function (dev) {
    dev.deviceId = dev.path;
  });
  cb(ret);
}
function nodeConnect (deviceId, cb) {
  cb({connectionId: new hid.HID(deviceId)});
}
function nodeSend (dev, reportId, data, cb) {
  data = Array.from(new Uint8Array(data));
  if (reportId) {
    data = [reportId].concat(data);
  }
  // See https://github.com/signal11/hidapi/issues/255
  // There is a quirk in hidapi that means an extra zero
  // byte needs to be prepended on Windows.
  var isWindows = function () {
    return require('os').release().indexOf('Windows') >= 0;
  };
  if (isWindows()) {
    data = [0x00].concat(data);
  }
  dev.write(data);
  cb();
}
function nodeSendFeatureReport (dev, reportId, data, cb) {
  data = Array.from(new Uint8Array(data));
  if (reportId) {
    data = [reportId].concat(data);
  }
  try {
    dev.sendFeatureReport(data);
  } catch (e) { }
  cb();
}
function nodeReceive (dev, cb) {
  dev.read(function (_, data) {
    cb(0, data);
  });
}
function nodeDisconnect (dev, cb) {
  dev.close();
  cb();
}
