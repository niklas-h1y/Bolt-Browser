const { dialog, desktopCapturer } = require('electron');

const DEFAULTS = {
  camera: true, microphone: true, screenShare: true, geolocation: true,
  bluetooth: true, usb: true, serial: true, hid: true,
  clipboardRead: false, clipboardWrite: true, webxr: true, nfc: true, sensors: true, pointerLock: true, keyboardLock: true, notifications: true, midi: true, midiSysex: true, localFonts: true, windowManagement: true, drm: true
};

const permissionToggle = {
  geolocation: 'geolocation', 'geolocation-approximate': 'geolocation',
  'display-capture': 'screenShare', bluetooth: 'bluetooth', usb: 'usb',
  serial: 'serial', hid: 'hid', 'clipboard-read': 'clipboardRead',
  'clipboard-sanitized-write': 'clipboardWrite', vr: 'webxr', ar: 'webxr',
  'hand-tracking': 'webxr', 'camera-pan-tilt-zoom': 'camera', nfc: 'nfc', accelerometer: 'sensors', gyroscope: 'sensors', magnetometer: 'sensors', pointerLock: 'pointerLock', keyboardLock: 'keyboardLock', notifications: 'notifications', midi: 'midi', midiSysex: 'midiSysex', 'local-fonts': 'localFonts', 'window-management': 'windowManagement', mediaKeySystem: 'drm'
};

function safeOrigin(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.origin : null; }
  catch { return null; }
}
function deviceLabel(device, type) {
  const name = device.productName || device.deviceName || device.name || device.displayName || '';
  const vendor = device.vendorId != null ? 'Vendor ' + device.vendorId : '';
  const product = device.productId != null ? 'Product ' + device.productId : '';
  const path = device.portName || device.path || '';
  return [name, vendor, product, path].filter(Boolean).join(' — ') || (type.toUpperCase() + ' device');
}
function deviceKey(origin, type, device) {
  return [origin, type, device.vendorId ?? '', device.productId ?? '', device.serialNumber ?? '', device.deviceId ?? device.portId ?? ''].join('|');
}
function configurePermissions({ ses, getWindow, getSettings }) {
  const grants = new Set();
  const deviceGrants = new Set();
  const settings = () => ({ ...DEFAULTS, ...(getSettings() || {}) });
  const enabled = key => settings()[key] === true;
  const hasGrant = (origin, permission) => grants.has(origin + '|' + permission);
  const grant = (origin, permission) => { if (origin) grants.add(origin + '|' + permission); };

  async function ask(title, message, buttons = ['Allow once', 'Block']) {
    const parent = getWindow();
    const options = { type: 'question', title, message, buttons, defaultId: buttons.length - 1, cancelId: buttons.length - 1, noLink: true };
    const result = parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    return result.response;
  }
  async function chooseDevice(title, devices, type) {
    if (!devices?.length) return null;
    const visible = devices.slice(0, 12);
    const labels = visible.map(d => deviceLabel(d, type));
    const buttons = [...labels, 'Cancel'];
    const choice = await ask(title, 'Choose a device to share with this website.', buttons);
    return choice < visible.length ? visible[choice] : null;
  }

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details = {}) => {
    const origin = safeOrigin(details.securityOrigin || requestingOrigin || details.requestingUrl || webContents?.getURL());
    if (!origin) return false;
    if (permission === 'media') {
      const type = details.mediaType;
      const allowed = [];
      if (type === 'video' || type === 'unknown') allowed.push(enabled('camera'));
      if (type === 'audio' || type === 'unknown') allowed.push(enabled('microphone'));
      return allowed.length > 0 && allowed.every(Boolean) && hasGrant(origin, 'media:' + type);
    }
    const toggle = permissionToggle[permission];
    if (!toggle || !enabled(toggle)) return false;
    if (['usb', 'serial', 'hid', 'bluetooth'].includes(permission)) return true;
    return hasGrant(origin, permission);
  });

  ses.setPermissionRequestHandler(async (webContents, permission, callback, details = {}) => {
    let answered = false;
    const done = value => { if (!answered) { answered = true; callback(Boolean(value)); } };
    try {
      const origin = safeOrigin(details.securityOrigin || details.requestingUrl || webContents?.getURL());
      if (!origin) return done(false);
      if (permission === 'media') {
        const types = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
        const wantsVideo = types.includes('video');
        const wantsAudio = types.includes('audio');
        if ((wantsVideo && !enabled('camera')) || (wantsAudio && !enabled('microphone')) || (!wantsVideo && !wantsAudio)) return done(false);
        const kinds = [wantsVideo && 'camera', wantsAudio && 'microphone'].filter(Boolean).join(' and ');
        const response = await ask('Allow camera and microphone?', origin + ' wants to use your ' + kinds + '.');
        if (response === 0) { if (wantsVideo) grant(origin, 'media:video'); if (wantsAudio) grant(origin, 'media:audio'); done(true); }
        else done(false);
        return;
      }
      const toggle = permissionToggle[permission];
      if (!toggle || !enabled(toggle)) return done(false);
      const names = {
        geolocation: 'location', 'geolocation-approximate': 'approximate location', nfc: 'NFC', accelerometer: 'motion sensors', gyroscope: 'motion sensors', magnetometer: 'motion sensors', pointerLock: 'pointer lock', keyboardLock: 'keyboard lock', notifications: 'desktop notifications', midi: 'MIDI', midiSysex: 'MIDI system-exclusive access', 'local-fonts': 'local font access', 'window-management': 'screen enumeration', mediaKeySystem: 'protected media playback (DRM)',
        'display-capture': 'screen sharing', 'clipboard-read': 'read clipboard',
        'clipboard-sanitized-write': 'write to clipboard', vr: 'VR access', ar: 'AR access',
        'hand-tracking': 'hand tracking', 'camera-pan-tilt-zoom': 'camera pan, tilt and zoom'
      };
      const label = names[permission] || permission;
      const response = await ask('Allow ' + label + '?', origin + ' is requesting ' + label + ' permission.');
      if (response === 0) { grant(origin, permission); done(true); } else done(false);
    } catch (error) {
      console.error('Permission request failed:', permission, error);
      done(false);
    }
  });

  ses.setDevicePermissionHandler(details => {
    const toggle = { usb: 'usb', serial: 'serial', hid: 'hid' }[details.deviceType];
    if (!toggle || !enabled(toggle)) return false;
    const origin = safeOrigin(details.origin);
    return Boolean(origin && deviceGrants.has(deviceKey(origin, details.deviceType, details.device || {})));
  });

  ses.on('select-usb-device', async (event, details, callback) => {
    event.preventDefault();
    const origin = safeOrigin(details.frame?.url || '');
    if (!enabled('usb') || !origin) return callback();
    try {
      const device = await chooseDevice('Select USB device', details.deviceList, 'usb');
      if (!device) return callback();
      deviceGrants.add(deviceKey(origin, 'usb', device));
      callback(device.deviceId);
    } catch (error) { console.error(error); callback(); }
  });

  ses.on('select-hid-device', async (event, details, callback) => {
    event.preventDefault();
    const origin = safeOrigin(details.frame?.url || '');
    if (!enabled('hid') || !origin) return callback();
    try {
      const device = await chooseDevice('Select HID device', details.deviceList, 'hid');
      if (!device) return callback();
      deviceGrants.add(deviceKey(origin, 'hid', device));
      callback(device.deviceId);
    } catch (error) { console.error(error); callback(); }
  });

  ses.on('select-serial-port', async (event, portList, webContents, callback) => {
    event.preventDefault();
    const origin = safeOrigin(webContents?.getURL());
    if (!enabled('serial') || !origin) return callback('');
    try {
      const port = await chooseDevice('Select serial port', portList, 'serial');
      if (!port) return callback('');
      deviceGrants.add(deviceKey(origin, 'serial', port));
      callback(port.portId);
    } catch (error) { console.error(error); callback(''); }
  });

  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const origin = safeOrigin(request.securityOrigin);
    if (!origin || !enabled('screenShare') || !hasGrant(origin, 'display-capture')) return callback(null);
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false
      });
      const selected = await chooseDevice('Choose what to share', sources, 'screen/window');
      if (!selected) return callback(null);
      callback({ video: selected, ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
    } catch (error) { console.error('Screen capture source selection failed:', error); callback(null); }
  });

  return {
    defaults: { ...DEFAULTS },
    updateSettings(next) {
      const before = settings();
      const after = { ...DEFAULTS, ...next };
      for (const [permission, toggle] of Object.entries(permissionToggle)) {
        if (before[toggle] && !after[toggle]) {
          for (const key of [...grants]) {
            if (key.endsWith('|' + permission) || (toggle === 'camera' && key.endsWith('|media:video')) || (toggle === 'microphone' && key.endsWith('|media:audio'))) grants.delete(key);
          }
          const deviceType = { usb: 'usb', serial: 'serial', hid: 'hid' }[toggle];
          if (deviceType) for (const key of [...deviceGrants]) if (key.includes('|' + deviceType + '|')) deviceGrants.delete(key);
        }
      }
      return after;
    },
    attachWebContents(webContents) {
      webContents.on('select-bluetooth-device', async (event, deviceList, callback) => {
        event.preventDefault();
        const origin = safeOrigin(webContents.getURL());
        if (!enabled('bluetooth') || !origin) return callback('');
        // Electron may emit this event before scanning has discovered any devices. Leave the callback pending so a later event can supply the updated list.
        if (!deviceList?.length) return;
        try {
          const device = await chooseDevice('Select Bluetooth device', deviceList, 'bluetooth');
          callback(device?.deviceId || '');
        } catch (error) { console.error(error); callback(''); }
      });
    }
  };
}

module.exports = { configurePermissions, DEFAULTS };
