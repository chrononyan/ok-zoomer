import Command from "../Command.js";

const sub = new Command();

sub.name("calnet").description("configure and interact with CalNet");

import checkCmd from "./check.js";
sub.addCommand(checkCmd);
import duoEnrollCmd from "./duoEnroll.js";
sub.addCommand(duoEnrollCmd);

export default sub;
