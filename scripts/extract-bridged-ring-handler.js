#!/usr/bin/env node

const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

console.log('Extracting BridgedRingHandler from RingManager...\n');

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

// Step 1: Extract method bodies
console.log('Step 1: Extracting method bodies...');

const getBridgedRingRingsMethod = classDeclaration.getMethod('getBridgedRingRings');
const isPartOfBridgedRingMethod = classDeclaration.getMethod('isPartOfBridgedRing');
const createBridgedRingMethod = classDeclaration.getMethod('createBridgedRing');

if (!getBridgedRingRingsMethod || !isPartOfBridgedRingMethod || !createBridgedRingMethod) {
  console.error('Could not find required methods');
  process.exit(1);
}

const getBridgedRingRingsBody = getBridgedRingRingsMethod.getBodyText() || '';
const isPartOfBridgedRingBody = isPartOfBridgedRingMethod.getBodyText() || '';
const createBridgedRingBody = createBridgedRingMethod.getBodyText() || '';

console.log('  ✓ Extracted method bodies');

// Step 2: Create BridgedRingHandler.ts
console.log('\nStep 2: Creating BridgedRingHandler.ts...');

const handlerFile = project.createSourceFile('src/BridgedRingHandler.ts', '', { overwrite: true });

// Add imports (CommonJS style)
handlerFile.insertText(0, `import RingManager = require("./RingManager");
import ArrayHelper = require("./ArrayHelper");
import RingConnection = require("./RingConnection");
import Ring = require("./Ring");

`);

// Create the handler class
const handlerClass = handlerFile.addClass({
  name: 'BridgedRingHandler',
  isExported: false
});

// Add property
handlerClass.addProperty({
  name: 'ringManager',
  type: 'RingManager',
  scope: 'private'
});

// Add constructor
handlerClass.addConstructor({
  parameters: [{ name: 'ringManager', type: 'RingManager' }],
  statements: 'this.ringManager = ringManager;'
});

// Add getBridgedRingRings method
const transformedGetBridgedRingRings = getBridgedRingRingsBody
  .replace(/this\.getRing/g, 'this.ringManager.getRing')
  .replace(/this\.ringConnections/g, 'this.ringManager.ringConnections')
  .replace(/this\.drawer/g, 'this.ringManager.drawer')
  .replace(/that\.getRing/g, 'that.ringManager.getRing')
  .replace(/that\.ringConnections/g, 'that.ringManager.ringConnections')
  .replace(/that\.drawer/g, 'that.ringManager.drawer');

handlerClass.addMethod({
  name: 'getBridgedRingRings',
  parameters: [{ name: 'ringId', type: 'number' }],
  returnType: 'number[]',
  statements: transformedGetBridgedRingRings
});

// Add isPartOfBridgedRing method
const transformedIsPartOfBridgedRing = isPartOfBridgedRingBody
  .replace(/this\.ringConnections/g, 'this.ringManager.ringConnections')
  .replace(/this\.drawer/g, 'this.ringManager.drawer');

handlerClass.addMethod({
  name: 'isPartOfBridgedRing',
  parameters: [{ name: 'ringId', type: 'number' }],
  returnType: 'boolean',
  statements: transformedIsPartOfBridgedRing
});

// Add createBridgedRing method
const transformedCreateBridgedRing = createBridgedRingBody
  .replace(/this\.getRing/g, 'this.ringManager.getRing')
  .replace(/this\.drawer/g, 'this.ringManager.drawer')
  .replace(/this\.edgeRingCount/g, 'this.ringManager.edgeRingCount')
  .replace(/this\.addRing/g, 'this.ringManager.addRing')
  .replace(/this\.removeRingConnectionsBetween/g, 'this.ringManager.removeRingConnectionsBetween')
  .replace(/this\.getRingConnections/g, 'this.ringManager.getRingConnections')
  .replace(/this\.getRingConnection/g, 'this.ringManager.getRingConnection');

handlerClass.addMethod({
  name: 'createBridgedRing',
  parameters: [
    { name: 'ringIds', type: 'number[]' },
    { name: 'sourceVertexId', type: 'number' }
  ],
  returnType: 'any',
  statements: transformedCreateBridgedRing
});

// Add processBridgedRingsInInitRings method (extracted from initRings loop)
const processBridgedRingsBody = `while (this.ringManager.rings.length > 0) {
  let id = -1;
  for (var i = 0; i < this.ringManager.rings.length; i++) {
    let ring = this.ringManager.rings[i];

    if (this.isPartOfBridgedRing(ring.id) && !ring.isBridged) {
      id = ring.id;
    }
  }

  if (id === -1) {
    break;
  }

  let ring = this.ringManager.getRing(id);

  let involvedRings = this.getBridgedRingRings(ring.id);

  this.ringManager.bridgedRing = true;
  this.createBridgedRing(involvedRings, ring.members[0]);
  this.ringManager.bridgedRing = false;

  for (var i = 0; i < involvedRings.length; i++) {
    this.ringManager.removeRing(involvedRings[i]);
  }
}`;

handlerClass.addMethod({
  name: 'processBridgedRingsInInitRings',
  returnType: 'void',
  statements: processBridgedRingsBody
});

// Add export
handlerFile.addExportAssignment({
  expression: 'BridgedRingHandler',
  isExportEquals: true
});

handlerFile.saveSync();
console.log('  ✓ Created BridgedRingHandler.ts');

console.log('\n' + '='.repeat(80));
console.log('EXTRACTION COMPLETE');
console.log('='.repeat(80));
console.log('Created BridgedRingHandler.ts with bridged ring logic');
console.log('\nNEXT STEPS:');
console.log('1. Run: node scripts/update-ring-manager-for-bridged.js');
console.log('2. Run: npx tsc && npx gulp && npm run test:regression');
