import { Command } from "commander";

export default class BaseCommand extends Command {
  // https://github.com/tj/commander.js/issues/1551
  opts() {
    return { ...this.parent?.opts(), ...super.opts() };
  }
}
