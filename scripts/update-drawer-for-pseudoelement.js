#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const pseudoElementMethods = [
  'initPseudoElements'
];

console.log('Updating DrawerBase.ts to use PseudoElementManager...\n');

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

console.log('Step 1: Adding PseudoElementManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './PseudoElementManager'
);

if (!existingImport) {
  drawerBaseFile.addImportDeclaration({
    moduleSpecifier: './PseudoElementManager',
    defaultImport: 'PseudoElementManager'
  });
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Adding pseudoElementManager property...');
const pseudoProp = classDeclaration.getProperty('pseudoElementManager');
if (!pseudoProp) {
  classDeclaration.addProperty({
    name: 'pseudoElementManager',
    type: 'PseudoElementManager',
    scope: 'private'
  });
  console.log('  ✓ Added pseudoElementManager property');
} else {
  console.log('  ✓ pseudoElementManager property already exists');
}

console.log('Step 3: Initializing pseudoElementManager in constructor...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';
  if (!bodyText.includes('this.pseudoElementManager = new PseudoElementManager(this)')) {
    // Add after drawingManager initialization
    const statements = constructor.getStatements();
    let insertIndex = 0;
    for (let i = 0; i < statements.length; i++) {
      const text = statements[i].getText();
      if (text.includes('this.drawingManager = new DrawingManager(this)')) {
        insertIndex = i + 1;
        break;
      }
    }
    constructor.insertStatements(insertIndex, 'this.pseudoElementManager = new PseudoElementManager(this);');
    console.log('  ✓ Added pseudoElementManager initialization');
  } else {
    console.log('  ✓ pseudoElementManager already initialized');
  }
}

console.log('Step 4: Converting methods to delegate to pseudoElementManager...');
let methodsConverted = 0;

for (const methodName of pseudoElementMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const params = method.getParameters().map(p => p.getName()).join(', ');
    const returnType = method.getReturnType().getText();
    const needsReturn = returnType !== 'void';

    const delegationCode = needsReturn
      ? `return this.pseudoElementManager.${methodName}(${params});`
      : `this.pseudoElementManager.${methodName}(${params});`;

    method.setBodyText(delegationCode);
    methodsConverted++;
  }
}

console.log(`  ✓ Converted ${methodsConverted} methods to delegate to pseudoElementManager`);

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log(`Converted ${methodsConverted} methods to delegate to PseudoElementManager`);
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
