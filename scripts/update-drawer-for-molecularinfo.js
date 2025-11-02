#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const molecularInfoMethods = [
  'getHeavyAtomCount',
  'getMolecularFormula'
];

console.log('Updating DrawerBase.ts to use MolecularInfoManager...\n');

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

console.log('Step 1: Adding MolecularInfoManager import...');
const existingImport = drawerBaseFile.getImportDeclaration(imp =>
  imp.getModuleSpecifierValue() === './MolecularInfoManager'
);

if (!existingImport) {
  drawerBaseFile.addImportDeclaration({
    moduleSpecifier: './MolecularInfoManager',
    defaultImport: 'MolecularInfoManager'
  });
  console.log('  ✓ Added import');
} else {
  console.log('  ✓ Import already exists');
}

console.log('Step 2: Adding molecularInfoManager property...');
const infoProp = classDeclaration.getProperty('molecularInfoManager');
if (!infoProp) {
  classDeclaration.addProperty({
    name: 'molecularInfoManager',
    type: 'MolecularInfoManager',
    scope: 'private'
  });
  console.log('  ✓ Added molecularInfoManager property');
} else {
  console.log('  ✓ molecularInfoManager property already exists');
}

console.log('Step 3: Initializing molecularInfoManager in constructor...');
const constructor = classDeclaration.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText() || '';
  if (!bodyText.includes('this.molecularInfoManager = new MolecularInfoManager(this)')) {
    // Add after pseudoElementManager initialization
    const statements = constructor.getStatements();
    let insertIndex = 0;
    for (let i = 0; i < statements.length; i++) {
      const text = statements[i].getText();
      if (text.includes('this.pseudoElementManager = new PseudoElementManager(this)')) {
        insertIndex = i + 1;
        break;
      }
    }
    constructor.insertStatements(insertIndex, 'this.molecularInfoManager = new MolecularInfoManager(this);');
    console.log('  ✓ Added molecularInfoManager initialization');
  } else {
    console.log('  ✓ molecularInfoManager already initialized');
  }
}

console.log('Step 4: Converting methods to delegate to molecularInfoManager...');
let methodsConverted = 0;

for (const methodName of molecularInfoMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const params = method.getParameters().map(p => p.getName()).join(', ');
    const returnType = method.getReturnType().getText();
    const needsReturn = returnType !== 'void';

    const delegationCode = needsReturn
      ? `return this.molecularInfoManager.${methodName}(${params});`
      : `this.molecularInfoManager.${methodName}(${params});`;

    method.setBodyText(delegationCode);
    methodsConverted++;
  }
}

console.log(`  ✓ Converted ${methodsConverted} methods to delegate to molecularInfoManager`);

console.log('Step 5: Saving DrawerBase.ts...');
drawerBaseFile.saveSync();
console.log(`  ✓ Saved: ${drawerBaseFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('UPDATE COMPLETE');
console.log('='.repeat(80));
console.log(`Converted ${methodsConverted} methods to delegate to MolecularInfoManager`);
console.log('\nNEXT STEPS:');
console.log('1. Run: npx tsc');
console.log('2. Fix any TypeScript errors');
console.log('3. Run: npx gulp && npm run test:regression');
