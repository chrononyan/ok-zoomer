# ok-zoomer

Automation toolkit for teaching at scale.

## Requirements

- [Node.js](https://nodejs.org) >= 16.0.0

## Install

```bash
npm install -g github:chrononyan/ok-zoomer#main
ok-zoomer -V
```

Features that use CalNet auth require `puppeteer` (warning: bundles Chromium, >150MB install size):

```bash
npm install -g puppeteer@13
```

## CalNet Auth Setup

Experimental: `ok-zoomer calnet setup` will semi-automatically walk you through the following steps.

1. Create a config file (`ok-zoomer.toml`) with your CalNet username and password:
  ```bash
  vim ok-zoomer.toml
  ```
  ```toml
  [calnet]
  username = "insert_username"
  password = "hunter2"
  ```
2. Visit the [CalNet 2FA device management page](https://bpr.calnet.berkeley.edu/account-manager/twoStepVerification/manage)
3. Add a new device
  - Device type: Tablet
  - Platform: Android
  - Yes, I have the app installed
  - Download the QR code (right click => Save As...)
  - Run `ok-zoomer calnet duo-enroll PATH_TO_QR_CODE_PNG`
4. (Optional) Rename the device to `ok-zoomer` or something, so you won't be confused later
5. Save the device name:
  ```bash
  ok-zoomer config calnet.duo.deviceName "insert_device_name"
  ```
