#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();
program.command("generate-meetings", "Generate Zoom meetings").parse();
