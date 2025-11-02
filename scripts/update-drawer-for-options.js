#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

console.log('Updating DrawerBase.ts to use OptionsManager...\n');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json')
});

const drawerBaseFile = project.getSourceFile('src/DrawerBase.ts');
if (!drawerBaseFile) {
  console.error('Could not find src/DrawerBase.ts');
  process.exit(1);
}

const classDeclaration = drawerBaseFile.getClass('DrawerBase');
if (!classDeclaration) {
  console.error('Could not find DrawerBase class');
  process.exit(1);
}

console.log('Step 1: Adding OptionsManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './OptionsManager'
);

if (!existingImport) {
  const graphProcessingImport = drawerBaseFile.getImportDeclaration(imp =>
    imp.getModuleSpecifierValue() === './GraphProcessingManager'
  );

  if (graphProcessingImport) {
    const index = graphProcessingImport.getChildIndex() + 1;
    drawerBaseFile.insertImportDeclaration(index, {
      moduleSpecifier: './OptionsManager',
      defaultImport: 'OptionsManager'
    });
  } else {
    drawerBaseFile.addImportDeclaration({
      moduleSpecifier: './OptionsManager',
      defaultImport: 'OptionsManager'
    });
  }
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Removing DefaultOptions import...');
const defaultOptionsImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './DefaultOptions'
);
if (defaultOptionsImport) {
  defaultOptionsImport.remove();
  console.log('  ✓ Removed DefaultOptions import');
} else {
  console.log('  ✓ DefaultOptions import not found');
}

console.log('Step 3: Removing defaultOptions property...');
const defaultOptionsProp = classDeclaration.getProperty('defaultOptions');
if (defaultOptionsProp) {
  defaultOptionsProp.remove();
  console.log('  ✓ Removed defaultOptions property');
} else {
  console.log('  ✓ defaultOptions property not found');
}

console.log('Step 4: Updating constructor to use OptionsManager...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';

  // Replace the options initialization block
  const newBody = bodyText
    .replace(
      /this\.defaultOptions = getDefaultOptions\(\);\s+this\.opts = Options\.extend\(true, this\.defaultOptions, options\);\s+this\.opts\.halfBondSpacing = this\.opts\.bondSpacing \/ 2\.0;\s+this\.opts\.bondLengthSq = this\.opts\.bondLength \* this\.opts\.bondLength;\s+this\.opts\.halfFontSizeLarge = this\.opts\.fontSizeLarge \/ 2\.0;\s+this\.opts\.quarterFontSizeLarge = this\.opts\.fontSizeLarge \/ 4\.0;\s+this\.opts\.fifthFontSizeSmall = this\.opts\.fontSizeSmall \/ 5\.0;\s+\/\/ Set the default theme\.\s+this\.theme = this\.opts\.themes\.dark;/,
      'const optionsManager = new OptionsManager(options);\n    this.opts = optionsManager.opts;\n    this.theme = optionsManager.theme;'
    );

  constructor.setBodyText(newBody);
  console.log('  ✓ Updated constructor to use OptionsManager');
} else {
  console.error('Could not find constructor');
  process.exit(1);
}

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log('DrawerBase.ts now uses OptionsManager for options initialization');
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
