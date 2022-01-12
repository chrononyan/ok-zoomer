import Command from "../Command.js";

const sub = new Command();

sub.name("zoom").description("interact with Zoom");

import createMeetingsCmd from "./createMeetings.js";
sub.addCommand(createMeetingsCmd);
import getRecordingLinksCmd from "./getRecordingLinks.js";
sub.addCommand(getRecordingLinksCmd);

export default sub;
