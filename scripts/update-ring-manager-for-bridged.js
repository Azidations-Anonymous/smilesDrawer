#!/usr/bin/env node

const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

console.log('Updating RingManager to use BridgedRingHandler...\n');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json')
});

const ringManagerFile = project.getSourceFile('src/RingManager.ts');
if (!ringManagerFile) {
  console.error('Could not find src/RingManager.ts');
  process.exit(1);
}

const classDeclaration = ringManagerFile.getClass('RingManager');
if (!classDeclaration) {
  console.error('Could not find RingManager class');
  process.exit(1);
}

// Step 1: Add import
console.log('Step 1: Adding BridgedRingHandler import...');
const importEqualsDeclarations = ringManagerFile.getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration);
console.log(`  Found ${importEqualsDeclarations.length} import declarations`);
if (importEqualsDeclarations.length > 0) {
  const lastImport = importEqualsDeclarations[importEqualsDeclarations.length - 1];
  ringManagerFile.insertText(lastImport.getEnd() + 1,
    '\nimport BridgedRingHandler = require("./BridgedRingHandler");');
  console.log('  ✓ Added import');
} else {
  console.error('No import declarations found');
  process.exit(1);
}

// Re-get the class declaration after modifying the file
const classDecl = ringManagerFile.getClass('RingManager');
if (!classDecl) {
  console.error('Could not find RingManager class after import');
  process.exit(1);
}

// Step 2: Change drawer property from private to public (needed by BridgedRingHandler)
console.log('\nStep 2: Updating drawer property visibility...');
const drawerProp = classDecl.getProperty('drawer');
if (drawerProp) {
  drawerProp.setScope('public');
  console.log('  ✓ Changed drawer from private to public');
}

// Step 3: Add bridgedRingHandler property
console.log('\nStep 3: Adding bridgedRingHandler property...');
const constructor = classDecl.getConstructors()[0];
const lastProperty = classDecl.getProperties().slice(-1)[0];

classDecl.insertProperty(classDecl.getProperties().length, {
  name: 'bridgedRingHandler',
  type: 'BridgedRingHandler',
  scope: 'private'
});
console.log('  ✓ Added bridgedRingHandler property');

// Step 4: Initialize in constructor
console.log('\nStep 4: Initializing bridgedRingHandler in constructor...');
constructor.addStatements('this.bridgedRingHandler = new BridgedRingHandler(this);');
console.log('  ✓ Added initialization in constructor');

// Step 5: Remove the three bridged ring methods
console.log('\nStep 5: Removing extracted methods...');
const getBridgedRingRingsMethod = classDecl.getMethod('getBridgedRingRings');
const isPartOfBridgedRingMethod = classDecl.getMethod('isPartOfBridgedRing');
const createBridgedRingMethod = classDecl.getMethod('createBridgedRing');

if (getBridgedRingRingsMethod) {
  getBridgedRingRingsMethod.remove();
  console.log('  ✓ Removed getBridgedRingRings method');
}
if (isPartOfBridgedRingMethod) {
  isPartOfBridgedRingMethod.remove();
  console.log('  ✓ Removed isPartOfBridgedRing method');
}
if (createBridgedRingMethod) {
  createBridgedRingMethod.remove();
  console.log('  ✓ Removed createBridgedRing method');
}

// Step 6: Replace the bridged ring processing loop in initRings
console.log('\nStep 6: Updating initRings method...');
const initRingsMethod = classDecl.getMethod('initRings');
if (initRingsMethod) {
  const bodyText = initRingsMethod.getBodyText() || '';

  // Replace the while loop with a call to bridgedRingHandler
  const newBody = bodyText.replace(
    /\/\/ Replace rings contained by a larger bridged ring with a bridged ring[\s\S]*?while \(this\.rings\.length > 0\)[\s\S]*?for \(var i = 0; i < involvedRings\.length; i\+\+\) \{[\s\S]*?this\.removeRing\(involvedRings\[i\]\);[\s\S]*?\}[\s\S]*?\}/,
    '// Replace rings contained by a larger bridged ring with a bridged ring\n        this.bridgedRingHandler.processBridgedRingsInInitRings();'
  );

  initRingsMethod.setBodyText(newBody);
  console.log('  ✓ Updated initRings to use bridgedRingHandler');
}

// Step 7: Save the file
console.log('\nStep 7: Saving RingManager.ts...');
ringManagerFile.saveSync();
console.log(`  ✓ Saved: ${ringManagerFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log('RingManager now uses BridgedRingHandler for bridged ring logic');
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
