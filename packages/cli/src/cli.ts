#!/usr/bin/env node
/**
 * @file src/cli.ts
 * @description Bootstraps the GWALN CLI, a workflow that fetches Grokipedia/Wikipedia content,
 *              analyzes structured snapshots, renders the analysis, and prepares Community Notes
 *              for publication on the OriginTrail DKG.
 * @author Doğu Abaris <abaris@null.net>
 *
 * Commands exposed by the entry point:
 *   - `init`: capture DKG node + blockchain defaults in `.gwalnrc.json`.
 *   - `topics`: sync or inspect the bundled topic catalog.
 *   - `lookup`: search for topics in the local catalog or discover new ones via API.
 *   - `fetch`: download and normalize snapshots from both sources.
 *   - `analyse`: compute the analysis JSON (with optional Gemini + citation verification).
 *   - `show`: render the analysis in the terminal or as an HTML report.
 *   - `notes`: build/publish JSON-LD Community Notes derived from the analysis.
 *   - `publish`: push arbitrary JSON-LD files to the DKG.
 *   - `query`: retrieve published Knowledge Assets from the DKG by UAL.
 *
 * @example
 *   gwaln init
 *   gwaln lookup "Moon"
 *   gwaln lookup "Bitcoin" --limit 3
 *   gwaln fetch wiki --topic moon
 *   gwaln analyse --topic moon --verify-citations --bias-verifier gemini
 *   gwaln show --topic moon --open-html
 *   gwaln notes build --topic moon --summary "Alignment check"
 *   gwaln notes publish --topic moon
 *   gwaln query --topic "Moon"
 *
 * @see README.md for full usage details.
 */

import chalk from 'chalk';
import { Command } from 'commander';
import figlet from 'figlet';
import fs from 'node:fs';
import path from 'node:path';
import analyseCommand from './commands/analyse';
import fetchCommand from './commands/fetch';
import initCommand from './commands/init';
import lookupCommand from './commands/lookup';
import notesCommand from './commands/notes';
import publishCommand from './commands/publish';
import queryCommand from './commands/query';
import showCommand from './commands/show';
import topicsCommand from './commands/topics';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

const program = new Command();
program
  .name('gwaln')
  .description('CLI for comparing Grokipedia and Wikipedia topics + drafting trust annotations')
  .version(pkg.version, '-v, --version', 'Display CLI version');

program.addCommand(initCommand);
program.addCommand(fetchCommand);
program.addCommand(analyseCommand);
program.addCommand(showCommand);
program.addCommand(notesCommand);
program.addCommand(topicsCommand);
program.addCommand(lookupCommand);
program.addCommand(publishCommand);
program.addCommand(queryCommand);

const args = process.argv.slice(2);

if (!args.length) {
  const banner = figlet.textSync('GWALN', { font: 'Standard' });
  console.log(chalk.hex('#9be2ff')(banner));
  program.outputHelp();
  process.exit(0);
} else {
  program.parse();
}
