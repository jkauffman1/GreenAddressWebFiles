var window = require('global/window');
var gettext = window.gettext || function (s) { return s; };

module.exports = HWWallet;

HWWallet.register = register;
HWWallet.registerError = registerError;
HWWallet.guiCallbacks = {};
HWWallet.registerGUICallback = registerGUICallback;
HWWallet.checkForDevices = checkForDevices;
HWWallet.allowAnotherCheck = allowAnotherCheck;
HWWallet.initSubclass = initSubclass;
HWWallet.currentWallet = new Promise(function (resolve, reject) {
  HWWallet.resolveCurrentWallet = resolve;
  HWWallet.rejectCurrentWallet = reject;
});

function allowAnotherCheck () {
  HWWallet.currentWallet = new Promise(function (resolve, reject) {
    HWWallet.resolveCurrentWallet = resolve;
    HWWallet.rejectCurrentWallet = reject;
  });
}

function HWWallet () {
}

function register (wallet) {
  if (HWWallet.resolveCurrentWallet) {
    HWWallet.resolveCurrentWallet(wallet);
    HWWallet.resolveCurrentWallet = null;
  }
}

function registerError (error) {
  if (HWWallet.resolveCurrentWallet) {
    HWWallet.rejectCurrentWallet(error);

    // create a new promise after the old one got rejected:
    HWWallet.currentWallet = new Promise(function (resolve, reject) {
      HWWallet.resolveCurrentWallet = resolve;
      HWWallet.rejectCurrentWallet = reject;
    });
  }
}

function registerGUICallback (name, cb) {
  HWWallet.guiCallbacks[name] = cb;
}

function _checkForDevices (Cls, network, options) {
  if (Cls.currentDevice) {
    var timeout = setTimeout(function () { failCurrent('Timeout'); }, 1000);
    return Cls.pingDevice(Cls.currentDevice).then(function () {
      clearTimeout(timeout);
      cbAll(Cls.currentDevice, new Cls(network));
    }, failCurrent);
  } else {
    doCheck();
  }
  var tick;

  function failCurrent (err) {
    clearTimeout(timeout);
    // disconnect old device to avoid repated callbacks
    Cls.disconnectCurrentDevice();
    ebAll(err, {all: true});
  }

  function doCheck () {
    tick = setInterval(singleCheck, 1000);
    function singleCheck () {
      Cls.listDevices(network, options).then(function (devices) {
        if (!devices.length) {
          createModalIfNeeded();
          ebAll({missingDevice: true});
        } else {
          if (!Cls.isChecking) {
            // don't initialize device twice
            return;
          }
          Cls.openDevice(network, options, devices[0]).then(function (dev_) {
            cbAll(dev_, new Cls(network), true);
          }).catch(function (e) {
            ebAll(e, {all: true});
          });
        }
      }).catch(function (err) {
        if (err === 'No device found.') {
          createModalIfNeeded();
          ebAll({missingDevice: true});
        } else {
          ebAll(err, {all: true});
        }
      });
    }
  }

  function createModalIfNeeded () {
    if (Cls.needsModal && !Cls.checkingModal) {
      Cls.checkingModal = (
        HWWallet.guiCallbacks.requireUsbDevice({reject: doCancel})
      );
    }
  }
  function finishChecking () {
    Cls.isChecking = false;
    Cls.needsModal = false;
    if (Cls.checkingModal) {
      Cls.checkingModal.close();
      Cls.checkingModal = null;
    }
  }
  function cbAll (device, wallet, newDevice) {
    finishChecking();
    if (newDevice) {
      Cls.initDevice(device);
    }
    Cls.currentDevice = device;
    Cls.foundCbs.forEach(function (cb) {
      cb(wallet);
    });
    Cls.foundCbs.length = 0;
    Cls.missingCbsOnce.length = 0;
    Cls.missingCbs.length = 0;
    clearInterval(tick);
    HWWallet.register(wallet);
  }
  function ebAll (error, options) {
    options = options || {};
    if (options.all) {
      HWWallet.registerError(error);
    }
    Cls.missingCbsOnce.forEach(function (data) {
      var i = data[0];
      var cb = data[1];
      Cls.foundCbs.splice(i, 1);
      cb(error);
    });
    Cls.missingCbsOnce.length = 0;

    var toSplice = [];
    Cls.missingCbs.forEach(function (data, i) {
      var j = data[0];
      var cb = data[1];
      var isModal = data[2];
      if ((isModal && options.isModal) || options.all) {
        toSplice.push(i);
        Cls.foundCbs.splice(j, 1);
        cb(error);
      }
    });
    for (var i = toSplice.length - 1; i >= 0; --i) {
      Cls.missingCbs.splice(toSplice[i], 1);
    }
    if (Cls.missingCbs.length + Cls.missingCbsOnce.length === 0) {
      finishChecking();
      clearInterval(tick);
    }
  }
  function doCancel () {
    ebAll(gettext('Cancelled'), {isModal: true});
  }
}

function checkForDevices (Cls, network, options) {
  if (options.failOnMissing && options.modal) {
    // modal implies some form of waiting
    throw new Error('Cannot set failOnMissing and modal simultaneously.');
  }

  // disable multiple repeated checking to avoid spamming the API, but allow
  // checking again with failOnMissing. this allows having one global check
  // + additional polling in case of such need
  // (for example, GA has a global check on signup/login page, and polls
  // additionally when user wants to initiate a hw wallet action without
  // having a wallet connected)
  if (!Cls.isChecking) {
    Cls.isChecking = true;
    _checkForDevices(Cls, network, options);
  }
  return new Promise(function (resolve, reject) {
    var i = Cls.foundCbs.length;
    Cls.foundCbs.push(resolve);
    if (options.failOnMissing) {
      Cls.missingCbsOnce.push([i, reject]);
    } else {
      Cls.missingCbs.push([i, reject, options.modal]);
    }
    if (options.modal) {
      Cls.needsModal = true;
    }
  });
}

function initSubclass (Cls) {
  Cls.foundCbs = [];
  Cls.missingCbs = [];
  Cls.missingCbsOnce = [];

  Cls.prototype.getDevice = function () {
    return Cls.checkForDevices(this.network, { modal: true });
  };
}
