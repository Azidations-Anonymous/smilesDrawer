#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const positioningMethods = [
  'position',
  'createNextBond',
  'getLastAngle',
  'getVerticesAt',
  'getClosestVertex',
  'getNonRingNeighbours'
];

console.log('Updating DrawerBase.ts to use PositioningManager...\n');

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

console.log('Step 1: Adding PositioningManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './PositioningManager'
);

if (!existingImport) {
  drawerBaseFile.addImportDeclaration({
    moduleSpecifier: './PositioningManager',
    defaultImport: 'PositioningManager'
  });
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Adding positioningManager property...');
const positioningProp = classDeclaration.getProperty('positioningManager');
if (!positioningProp) {
  classDeclaration.addProperty({
    name: 'positioningManager',
    type: 'PositioningManager',
    scope: 'private'
  });
  console.log('  ✓ Added positioningManager property');
} else {
  console.log('  ✓ positioningManager property already exists');
}

console.log('Step 3: Initializing positioningManager in constructor...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';
  if (!bodyText.includes('this.positioningManager = new PositioningManager(this)')) {
    // Add after overlapResolver initialization
    const statements = constructor.getStatements();
    let insertIndex = 0;
    for (let i = 0; i < statements.length; i++) {
      const text = statements[i].getText();
      if (text.includes('this.overlapResolver = new OverlapResolutionManager(this)')) {
        insertIndex = i + 1;
        break;
      }
    }
    constructor.insertStatements(insertIndex, 'this.positioningManager = new PositioningManager(this);');
    console.log('  ✓ Added positioningManager initialization');
  } else {
    console.log('  ✓ positioningManager already initialized');
  }
}

console.log('Step 4: Converting methods to delegate to positioningManager...');
let methodsConverted = 0;

for (const methodName of positioningMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const params = method.getParameters().map(p => p.getName()).join(', ');
    const returnType = method.getReturnType().getText();
    const needsReturn = returnType !== 'void';

    const delegationCode = needsReturn
      ? `return this.positioningManager.${methodName}(${params});`
      : `this.positioningManager.${methodName}(${params});`;

    method.setBodyText(delegationCode);
    methodsConverted++;
  }
}

console.log(`  ✓ Converted ${methodsConverted} methods to delegate to positioningManager`);

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log(`Converted ${methodsConverted} methods to delegate to PositioningManager`);
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
