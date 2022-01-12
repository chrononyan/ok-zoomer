import Command from "../Command.js";

const sub = new Command();

sub
  .name("create-meetings")
  .description("batch-create Zoom meetings")
  .action(async () => {
    throw new Error("TODO");
  });

export default sub;
