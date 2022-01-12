import undici from "undici";

import { randomUserAgent } from "./browser.js";
import sleep from "./sleep.js";

const DEFAULT_ZOOM_ORIGIN = "https://berkeley.zoom.us";

export async function getRecordings(opts) {
  const { csrfToken = true, page = 1, quiet = false } = opts;

  const body = new URLSearchParams({
    from: "",
    to: "",
    search_value: "",
    transcript_keyword: "",
    search_type: "mixed",
    p: page,
    search_status: "0",
    assistant_host_id: "",
  });
  const res = await request("/recording/host_list", {
    ...opts,
    csrfToken: csrfToken,
    body: body.toString(),
  });
  const { result } = await getJSON(res);
  const pageNum = result.page;
  const numRecordings = result.total_records;
  const numPages = Math.ceil(numRecordings / result.page_size);
  if (!quiet)
    console.error(
      `[get-recording-links] fetched recordings (page ${pageNum} / ${numPages})`
    );

  let recordings = result.recordings.map((recording) => {
    return {
      meetingRoomID: recording.meetingNumber,
      meetingID: recording.meetingId,
      timestamp: new Date(recording.createTime).toISOString(),
      topic: recording.topic,
    };
  });

  if (pageNum < numPages) {
    await sleep(opts.interval);
    recordings = recordings.concat(
      await getRecordings({ ...opts, page: pageNum + 1 })
    );
  }

  return recordings;
}

export async function getRecordingShareInfo(meetingID, opts = {}) {
  const {
    csrfToken = true,
    password = "",
    zoomOrigin = DEFAULT_ZOOM_ORIGIN,
  } = opts;

  let body = new URLSearchParams({
    passwd: password,
    id: meetingID,
  });
  let res = await request("/recording/update_meet_passwd", {
    ...opts,
    csrfToken: csrfToken,
    body: body.toString(),
  });
  let data = await getJSON(res);

  body = new URLSearchParams({
    meeting_id: meetingID,
  });
  res = await request("/recording/get_recordmeet_shareinfo", {
    ...opts,
    csrfToken: csrfToken,
    body: body.toString(),
  });
  data = await getJSON(res);
  const result = JSON.parse(data.result);

  const encryptedRecordingID = result.encryptMeetId;

  return {
    link: new URL(`/rec/share/${encryptedRecordingID}`, zoomOrigin).toString(),
  };
}

export async function getCSRFToken(opts) {
  const res = await request("/csrf_js", {
    ...opts,
    headers: {
      "FETCH-CSRF-TOKEN": "1",
    },
    body: "",
  });
  if (res.statusCode !== 200)
    throw new Error(`HTTP ${res.statusCode} (${res.method} ${res.url})`);
  const data = await res.body.text();
  const csrfTokenMatch = data.match(/^ZOOM-CSRFTOKEN:([0-9A-Za-z_-]+)$/);
  if (!csrfTokenMatch) throw new Error("Couldn't get CSRF token");
  return csrfTokenMatch[1];
}

export async function request(url, opts = {}) {
  const {
    cookieString,
    userAgent = randomUserAgent.toString(),
    zoomOrigin = DEFAULT_ZOOM_ORIGIN,
  } = opts;

  opts.headers = {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.5",
    "X-Requested-With":
      "XMLHttpRequest, XMLHttpRequest, OWASP CSRFGuard Project",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Referer: `${zoomOrigin}/meeting`,
    Origin: zoomOrigin,
    Cookie: cookieString,
    ...opts.headers,
  };

  url = new URL(url, zoomOrigin);

  const csrfToken = opts.csrfToken;
  if (csrfToken) {
    opts.headers["ZOOM-CSRFTOKEN"] =
      csrfToken === true
        ? await getCSRFToken({ cookieString, userAgent, zoomOrigin })
        : csrfToken;
  }

  if (opts.body !== undefined) {
    if (opts.method === undefined) opts.method = "POST";
    if (opts.headers["Content-Type"] === undefined) {
      opts.headers["Content-Type"] =
        "application/x-www-form-urlencoded; charset=UTF-8";
    }
  }

  const res = await undici.request(url, opts);
  if (res.statusCode !== 200)
    throw new Error(`HTTP ${res.statusCode} (${res.method} ${res.url})`);
  return res;
}

export async function getJSON(res) {
  const data = await res.body.json();
  if (!data.status || data.errorCode !== 0 || data.errorMessage) {
    if (data.errorCode === 201)
      throw new Error("Session expired, try again in a few seconds");
    throw new Error(
      `Zoom error: ${data.errorMessage} (code: ${data.errorCode})`
    );
  }
  return data;
}
