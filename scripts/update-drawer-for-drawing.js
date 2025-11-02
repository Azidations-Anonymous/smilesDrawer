#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const drawingMethods = [
  'draw',
  'drawEdges',
  'drawEdge',
  'drawVertices',
  'rotateDrawing',
  'getEdgeNormals'
];

console.log('Updating DrawerBase.ts to use DrawingManager...\n');

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

console.log('Step 1: Adding DrawingManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './DrawingManager'
);

if (!existingImport) {
  drawerBaseFile.addImportDeclaration({
    moduleSpecifier: './DrawingManager',
    defaultImport: 'DrawingManager'
  });
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Adding drawingManager property...');
const drawingProp = classDeclaration.getProperty('drawingManager');
if (!drawingProp) {
  classDeclaration.addProperty({
    name: 'drawingManager',
    type: 'DrawingManager',
    scope: 'private'
  });
  console.log('  ✓ Added drawingManager property');
} else {
  console.log('  ✓ drawingManager property already exists');
}

console.log('Step 3: Initializing drawingManager in constructor...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';
  if (!bodyText.includes('this.drawingManager = new DrawingManager(this)')) {
    // Add after positioningManager initialization
    const statements = constructor.getStatements();
    let insertIndex = 0;
    for (let i = 0; i < statements.length; i++) {
      const text = statements[i].getText();
      if (text.includes('this.positioningManager = new PositioningManager(this)')) {
        insertIndex = i + 1;
        break;
      }
    }
    constructor.insertStatements(insertIndex, 'this.drawingManager = new DrawingManager(this);');
    console.log('  ✓ Added drawingManager initialization');
  } else {
    console.log('  ✓ drawingManager already initialized');
  }
}

console.log('Step 4: Converting methods to delegate to drawingManager...');
let methodsConverted = 0;

for (const methodName of drawingMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const params = method.getParameters().map(p => p.getName()).join(', ');
    const returnType = method.getReturnType().getText();
    const needsReturn = returnType !== 'void';

    const delegationCode = needsReturn
      ? `return this.drawingManager.${methodName}(${params});`
      : `this.drawingManager.${methodName}(${params});`;

    method.setBodyText(delegationCode);
    methodsConverted++;
  }
}

console.log(`  ✓ Converted ${methodsConverted} methods to delegate to drawingManager`);

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log(`Converted ${methodsConverted} methods to delegate to DrawingManager`);
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
