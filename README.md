# ok-zoomer

Toolkit for automating tasks to make teaching 1000+ students less painful.

## Install

Note: `ok-zoomer` uses Puppeteer to simulate a browser environment, so a build of Chromium (\~200MB) will automatically be downloaded during installation.

You can directly run `ok-zoomer` with `npx`:

```bash
npx chrononyan/ok-zoomer --help
```

`npx` is useful for dev versions, or running a version from a  specific Git commit/tag:

```bash
npx chrononyan/ok-zoomer#b0bacafe --help
npx chrononyan/ok-zoomer#v0.1.1 --help
```

Alternatively, you can install `ok-zoomer` as a global command with:

```bash
npm install -g chrononyan/ok-zoomer
ok-zoomer --help
```

`ok-zoomer` is interchangeable with `npx chrononyan/ok-zoomer` or  `npx chrononyan/ok-zoomer#GIT_REF`.

## Meeting Generation

Batch-generate Zoom meetings for a list of email addresses. Useful for recording exams.

If your course has a SPA account, it is recommended to use that account for generating meetings.

### Setup

Visit your account settings (https://berkeley.zoom.us/profile/setting). It is highly recommended to review all the options available, but some important ones:

- **In Meeting (Basic)**:
  - **Co-host**: enable
  - **Screen sharing**: enable
- **Email Notification**:
  - **When a cloud recording is available**: disable
  - **When a meeting is cancelled**: disable
  - **When an alternative host is set or removed from a meeting**: disable
  - **When the cloud recording is going to be permanently deleted from trash**: disable

### Usage

```bash
ok-zoomer generate-meetings -i roster.csv -o meetings.csv --topic "Meeting ({email})" --description "Meeting for {email}" --template-id <TEMPLATE_ID>
```

Options are described in the help page (`ok-zoomer generate-meetings --help`).

Zoom account-level default settings are rather obscure, so meeting templates are recommended (see below).

### Meeting Templates

1. Schedule a meeting (https://berkeley.zoom.us/meeting/schedule). You should set:
  - **Topic**: Recorded Exam Meeting Template
  - **Recurring meeting**: yes
  - **Recurrence**: No Fixed Time
  - **Meeting ID**: Generate Automatically
  - Security (pick only one, disable the others):
    - Passcode
    - Require authentication (since auth is needed for co-host anyway)
  - Video:
    - **Host video**: on
    - **Participant video**: on
  - **Audio**: both
  - Options:
    - **Allow participants to join anytime**: no
    - **Mute participants upon entry**: no
    - **Breakout Room pre-assign**: no
    - **Automatically record meeting**: yes
      - **Record location**: in the cloud
    - **Enable focus mode when meeting starts**: no
2. After saving the meeting, go to the meeting page in the upcoming meetings list (not the Join, Start, or Edit buttons).
3. Click the "Save as Template" button (near the bottom). Enable the save recurrence option, and save the template.
4. Go to your meeting templates list (https://berkeley.zoom.us/meeting#/template/list) and find the template. Get the template ID from the URL (e.g. `https://berkeley.zoom.us/meeting/template/TEMPLATE_ID`).

You can then tell `ok-zoomer` to use the settings in the meeting template:

```bash
ok-zoomer generate-meetings --template-id TEMPLATE_ID
```
