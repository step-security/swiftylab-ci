#!/usr/bin/env node
import fs from 'fs';
import { execSync } from 'child_process';
import readdirGlob from 'readdir-glob';
import core from '@actions/core';
import plist from 'plist';
import parseArgs from 'minimist';

const argv = parseArgs(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (argv['generate-linuxmain'] == true) {
  core.startGroup(`Generating LinuxMain for swift package`);
  execSync(
    `swift test --verbose --generate-linuxmain`, {
      stdio: ['inherit', 'inherit', 'inherit'],
      encoding: 'utf-8'
    }
  );
  core.endGroup();
}

core.startGroup(`Generating Xcode project for swift package`);
const xcodegenCmd = `swift package --verbose generate-xcodeproj \
--xcconfig-overrides Helpers/${pkg.name}.xcconfig \
--skip-extra-files`;

core.info(`Running command: ${xcodegenCmd}`);
execSync(
  xcodegenCmd, {
    stdio: ['inherit', 'inherit', 'inherit'],
    encoding: 'utf-8'
  }
);
core.endGroup();

core.startGroup(`Adding documentation catalogue to Xcode project`);
const rubyCommand = `"require 'xcodeproj'
project = Xcodeproj::Project.open('${pkg.name}.xcodeproj')
project_changed = false
project.native_targets.each do |target|
  group = project[\\"Sources/#{target.name}\\"]
  docc = \\"#{target.name}.docc\\"
  next if !group.is_a?(Xcodeproj::Project::Object::PBXGroup) ||
   !File.exist?(File.join(group.path, docc)) ||
   group.find_file_by_path(docc).is_a?(Xcodeproj::Project::Object::PBXFileReference)
  project_changed = true
  file = group.new_reference(docc)
  target.add_file_references([file])
end
project.save() if project_changed"`;
execSync(
  `ruby -e ${rubyCommand}`, {
    stdio: ['inherit', 'inherit', 'inherit'],
    encoding: 'utf-8'
  }
);
core.endGroup();

core.startGroup(`Updating version to ${pkg.version} in plist`);
const plistGlobberer = readdirGlob('.', { pattern: `${pkg.name}.xcodeproj/*.plist` });
plistGlobberer.on(
  'match',
  m => {
    const buffer = plist.parse(fs.readFileSync(m.absolute, 'utf8'));
    const props = JSON.parse(JSON.stringify(buffer));
    // props.CFBundleVersion = pkg.version;
    props.CFBundleShortVersionString = pkg.version;
    fs.writeFileSync(m.absolute, plist.build(props));
    core.endGroup();
  }
);

plistGlobberer.on('error', err => { core.error(err); });
