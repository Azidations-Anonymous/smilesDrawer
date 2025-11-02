#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

console.log('Creating OptionsManager...\n');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json')
});

console.log('Step 1: Creating OptionsManager.ts...');

const managerFile = project.createSourceFile('src/OptionsManager.ts', '', { overwrite: true });

// Add imports
managerFile.addImportDeclaration({
  moduleSpecifier: './DefaultOptions',
  defaultImport: 'getDefaultOptions'
});

managerFile.addImportDeclaration({
  moduleSpecifier: './Options',
  namespaceImport: 'Options'
});

// Create the manager class
const managerClass = managerFile.addClass({
  name: 'OptionsManager',
  isExported: false
});

// Add properties
managerClass.addProperty({
  name: 'defaultOptions',
  type: 'any',
  scope: 'private'
});

managerClass.addProperty({
  name: 'opts',
  type: 'any'
});

managerClass.addProperty({
  name: 'theme',
  type: 'any'
});

// Add constructor
managerClass.addConstructor({
  parameters: [{ name: 'userOptions', type: 'any' }],
  statements: `this.defaultOptions = getDefaultOptions();

    this.opts = Options.extend(true, this.defaultOptions, userOptions);
    this.opts.halfBondSpacing = this.opts.bondSpacing / 2.0;
    this.opts.bondLengthSq = this.opts.bondLength * this.opts.bondLength;
    this.opts.halfFontSizeLarge = this.opts.fontSizeLarge / 2.0;
    this.opts.quarterFontSizeLarge = this.opts.fontSizeLarge / 4.0;
    this.opts.fifthFontSizeSmall = this.opts.fontSizeSmall / 5.0;

    // Set the default theme.
    this.theme = this.opts.themes.dark;`
});

// Add export
managerFile.addExportAssignment({
  expression: 'OptionsManager',
  isExportEquals: true
});

console.log('  ✓ Created OptionsManager.ts');

console.log('\nStep 2: Saving OptionsManager.ts...');
managerFile.saveSync();
console.log(`  ✓ Saved: ${managerFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('CREATION COMPLETE');
console.log('='.repeat(80));
console.log('Created OptionsManager.ts with options initialization logic');
console.log('\nNEXT STEPS:');
console.log('1. Run: node scripts/update-drawer-for-options.js');
console.log('2. Run: npx tsc && npx gulp && npm run test:regression');
