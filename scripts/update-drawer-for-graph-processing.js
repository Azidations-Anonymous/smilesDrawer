#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const methodsToDelegate = [
  'processGraph',
  'isEdgeRotatable'
];

console.log('Updating DrawerBase.ts to use GraphProcessingManager...\n');

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

console.log('Step 1: Adding GraphProcessingManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './GraphProcessingManager'
);

if (!existingImport) {
  const initManagerImport = drawerBaseFile.getImportDeclaration(imp =>
    imp.getModuleSpecifierValue() === './InitializationManager'
  );

  if (initManagerImport) {
    const index = initManagerImport.getChildIndex() + 1;
    drawerBaseFile.insertImportDeclaration(index, {
      moduleSpecifier: './GraphProcessingManager',
      defaultImport: 'GraphProcessingManager'
    });
  } else {
    drawerBaseFile.addImportDeclaration({
      moduleSpecifier: './GraphProcessingManager',
      defaultImport: 'GraphProcessingManager'
    });
  }
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Adding graphProcessingManager property...');
const graphProp = classDeclaration.getProperty('graphProcessingManager');
if (!graphProp) {
  // Find the initializationManager property and insert after it
  const initProp = classDeclaration.getProperty('initializationManager');
  if (initProp) {
    const index = initProp.getChildIndex() + 1;
    classDeclaration.insertProperty(index, {
      name: 'graphProcessingManager',
      type: 'GraphProcessingManager',
      scope: 'private'
    });
  } else {
    classDeclaration.addProperty({
      name: 'graphProcessingManager',
      type: 'GraphProcessingManager',
      scope: 'private'
    });
  }
  console.log('  ✓ Added graphProcessingManager property');
} else {
  console.log('  ✓ graphProcessingManager property already exists');
}

console.log('Step 3: Initializing graphProcessingManager in constructor...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';
  if (!bodyText.includes('this.graphProcessingManager = new GraphProcessingManager(this)')) {
    // Add after initializationManager initialization
    const statements = constructor.getStatements();
    let insertIndex = 0;
    for (let i = 0; i < statements.length; i++) {
      const text = statements[i].getText();
      if (text.includes('this.initializationManager = new InitializationManager(this)')) {
        insertIndex = i + 1;
        break;
      }
    }
    constructor.insertStatements(insertIndex, 'this.graphProcessingManager = new GraphProcessingManager(this);');
    console.log('  ✓ Added graphProcessingManager initialization');
  } else {
    console.log('  ✓ graphProcessingManager already initialized');
  }
}

console.log('Step 4: Converting methods to delegate to graphProcessingManager...');
let methodsConverted = 0;

for (const methodName of methodsToDelegate) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const params = method.getParameters().map(p => p.getName()).join(', ');
    const returnType = method.getReturnType().getText();
    const needsReturn = returnType !== 'void';

    const delegationCode = needsReturn
      ? `return this.graphProcessingManager.${methodName}(${params});`
      : `this.graphProcessingManager.${methodName}(${params});`;

    method.setBodyText(delegationCode);
    methodsConverted++;
  }
}

console.log(`  ✓ Converted ${methodsConverted} methods to delegate to graphProcessingManager`);

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log(`Converted ${methodsConverted} methods to delegate to GraphProcessingManager`);
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
