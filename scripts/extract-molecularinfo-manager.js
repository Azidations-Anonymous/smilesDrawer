#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

const molecularInfoMethods = [
  'getHeavyAtomCount',
  'getMolecularFormula'
];

console.log('Extracting MolecularInfoManager...\n');

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

console.log('Step 1: Analyzing molecular info methods...');

const methodsToExtract = [];
for (const methodName of molecularInfoMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    const startLine = method.getStartLineNumber();
    const endLine = method.getEndLineNumber();
    const lineCount = endLine - startLine + 1;
    console.log(`  - ${methodName} (lines ${startLine}-${endLine}, ${lineCount} lines)`);
    methodsToExtract.push({ name: methodName, method, startLine, endLine, lineCount });
  }
}

const totalLines = methodsToExtract.reduce((sum, m) => sum + m.lineCount, 0);
console.log(`\nTotal: ${methodsToExtract.length} methods, ~${totalLines} lines`);

console.log('\nStep 2: Creating MolecularInfoManager file...');

const infoFile = project.createSourceFile('src/MolecularInfoManager.ts', '', { overwrite: true });

infoFile.addImportDeclaration({
  moduleSpecifier: './DrawerBase',
  defaultImport: 'DrawerBase'
});

console.log('Step 3: Creating MolecularInfoManager class...');

const infoClass = infoFile.addClass({
  name: 'MolecularInfoManager',
  isExported: false
});

infoClass.addProperty({
  name: 'drawer',
  type: 'DrawerBase',
  scope: 'private'
});

infoClass.addConstructor({
  parameters: [{ name: 'drawer', type: 'DrawerBase' }],
  statements: 'this.drawer = drawer;'
});

console.log('Step 4: Extracting methods...');

for (const methodName of molecularInfoMethods) {
  const method = classDeclaration.getMethod(methodName);
  if (method) {
    console.log(`  - Extracting: ${methodName}`);

    infoClass.addMethod({
      name: methodName,
      parameters: method.getParameters().map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
        hasQuestionToken: p.hasQuestionToken(),
        initializer: p.getInitializer()?.getText()
      })),
      returnType: method.getReturnType().getText(),
      statements: method.getBodyText() || ''
    });
  }
}

infoFile.addStatements('export = MolecularInfoManager;');

console.log('Step 5: Analyzing dependencies...');

const methodBodies = methodsToExtract.map(m => {
  const method = infoClass.getMethod(m.name);
  return method ? method.getBodyText() : '';
}).join('\n');

const thisReferences = (methodBodies.match(/this\.\w+/g) || [])
  .map(ref => ref.replace('this.', ''))
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();

console.log('\nProperties/methods referenced via "this.":');
thisReferences.forEach(ref => {
  const isInfoMethod = molecularInfoMethods.includes(ref);
  const marker = isInfoMethod ? '[METHOD]' : '[EXTERNAL]';
  console.log(`  ${marker} this.${ref}`);
});

console.log('\nStep 6: Saving MolecularInfoManager.ts...');
infoFile.saveSync();
console.log(`Saved: ${infoFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('EXTRACTION COMPLETE');
console.log('='.repeat(80));
console.log(`Extracted ${methodsToExtract.length} methods (~${totalLines} lines)`);
console.log('\nNEXT STEPS:');
console.log('1. Fix "this." references to use "this.drawer." for external properties');
console.log('2. Update DrawerBase.ts to use MolecularInfoManager');
console.log('3. Run: npx tsc && npx gulp && npm run test:regression');
