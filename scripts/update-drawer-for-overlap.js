#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const overlapMethods = [
  'getOverlapScore',
  'chooseSide',
  'resolvePrimaryOverlaps',
  'resolveSecondaryOverlaps',
  'rotateSubtree',
  'getSubtreeOverlapScore',
  'getCurrentCenterOfMass',
  'getCurrentCenterOfMassInNeigbourhood'
];

console.log('Updating DrawerBase.ts to use OverlapResolutionManager...\n');

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

console.log('Step 1: Adding OverlapResolutionManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './OverlapResolutionManager'
);

if (!existingImport) {
  drawerBaseFile.addImportDeclaration({
    moduleSpecifier: './OverlapResolutionManager',
    defaultImport: 'OverlapResolutionManager'
  });
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Adding overlapResolver property...');
const overlapProp = classDeclaration.getProperty('overlapResolver');
if (!overlapProp) {
  classDeclaration.addProperty({
    name: 'overlapResolver',
    type: 'OverlapResolutionManager',
    scope: 'private'
  });
  console.log('  ✓ Added overlapResolver property');
} else {
  console.log('  ✓ overlapResolver property already exists');
}

console.log('Step 3: Initializing overlapResolver in constructor...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';
  if (!bodyText.includes('this.overlapResolver = new OverlapResolutionManager(this)')) {
    // Add after stereochemistryManager initialization
    const statements = constructor.getStatements();
    let insertIndex = 0;
    for (let i = 0; i < statements.length; i++) {
      const text = statements[i].getText();
      if (text.includes('this.stereochemistryManager = new StereochemistryManager(this)')) {
        insertIndex = i + 1;
        break;
      }
    }
    constructor.insertStatements(insertIndex, 'this.overlapResolver = new OverlapResolutionManager(this);');
    console.log('  ✓ Added overlapResolver initialization');
  } else {
    console.log('  ✓ overlapResolver already initialized');
  }
}

console.log('Step 4: Converting methods to delegate to overlapResolver...');
let methodsConverted = 0;

for (const methodName of overlapMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const params = method.getParameters().map(p => p.getName()).join(', ');
    const returnType = method.getReturnType().getText();
    const needsReturn = returnType !== 'void';

    const delegationCode = needsReturn
      ? `return this.overlapResolver.${methodName}(${params});`
      : `this.overlapResolver.${methodName}(${params});`;

    method.setBodyText(delegationCode);
    methodsConverted++;
  }
}

console.log(`  ✓ Converted ${methodsConverted} methods to delegate to overlapResolver`);

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log(`Converted ${methodsConverted} methods to delegate to OverlapResolutionManager`);
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
