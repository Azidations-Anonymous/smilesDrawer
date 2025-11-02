#!/usr/bin/env node

const { Project } = require('ts-morph');
const path = require('path');

console.log('Extracting GraphProcessingManager from DrawerBase...\n');

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

console.log('Step 1: Extracting processGraph and isEdgeRotatable methods...');

const processGraphMethod = classDeclaration.getMethod('processGraph');
const isEdgeRotatableMethod = classDeclaration.getMethod('isEdgeRotatable');

if (!processGraphMethod) {
  console.error('Could not find processGraph method');
  process.exit(1);
}

if (!isEdgeRotatableMethod) {
  console.error('Could not find isEdgeRotatable method');
  process.exit(1);
}

const processGraphBody = processGraphMethod.getBodyText() || '';
const isEdgeRotatableBody = isEdgeRotatableMethod.getBodyText() || '';

console.log(`  ✓ Found processGraph method (~${processGraphBody.split('\n').length} lines)`);
console.log(`  ✓ Found isEdgeRotatable method (~${isEdgeRotatableBody.split('\n').length} lines)`);

console.log('\nStep 2: Creating GraphProcessingManager.ts...');

const managerFile = project.createSourceFile('src/GraphProcessingManager.ts', '', { overwrite: true });

// Add imports
managerFile.addImportDeclaration({
  moduleSpecifier: './MathHelper',
  namespaceImport: 'MathHelper'
});

// Create the manager class
const managerClass = managerFile.addClass({
  name: 'GraphProcessingManager',
  isExported: false
});

// Add drawer property
managerClass.addProperty({
  name: 'drawer',
  type: 'any',
  scope: 'private'
});

// Add constructor
managerClass.addConstructor({
  parameters: [{ name: 'drawer', type: 'any' }],
  statements: 'this.drawer = drawer;'
});

// Add processGraph method with transformed body
const transformedProcessGraphBody = processGraphBody.replace(/this\./g, 'this.drawer.');
managerClass.addMethod({
  name: 'processGraph',
  returnType: 'void',
  statements: transformedProcessGraphBody
});

// Add isEdgeRotatable method with transformed body
const transformedIsEdgeRotatableBody = isEdgeRotatableBody.replace(/this\./g, 'this.drawer.');
managerClass.addMethod({
  name: 'isEdgeRotatable',
  parameters: [{ name: 'edge', type: 'any' }],
  returnType: 'boolean',
  statements: transformedIsEdgeRotatableBody
});

// Add export
managerFile.addExportAssignment({
  expression: 'GraphProcessingManager',
  isExportEquals: true
});

console.log('  ✓ Created GraphProcessingManager.ts');

console.log('\nStep 3: Saving GraphProcessingManager.ts...');
managerFile.saveSync();
console.log(`  ✓ Saved: ${managerFile.getFilePath()}`);

console.log('\n' + '='.repeat(80));
console.log('EXTRACTION COMPLETE');
console.log('='.repeat(80));
console.log('Created GraphProcessingManager.ts with graph processing methods');
console.log('\nNEXT STEPS:');
console.log('1. Run: node scripts/update-drawer-for-graph-processing.js');
console.log('2. Run: npx tsc && npx gulp && npm run test:regression');
