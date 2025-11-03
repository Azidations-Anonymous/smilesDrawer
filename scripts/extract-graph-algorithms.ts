import { Project, Scope } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: './tsconfig.json'
});

// Get the source file
const graphFile = project.getSourceFile('src/graph/Graph.ts');
if (!graphFile) {
  throw new Error('Could not find Graph.ts');
}

// Create the new file for GraphAlgorithms
const algorithmsFile = project.createSourceFile(
  'src/graph/GraphAlgorithms.ts',
  '',
  { overwrite: true }
);

// Add imports to the new file
algorithmsFile.addImportDeclaration({
  moduleSpecifier: './Graph',
  defaultImport: 'Graph'
});
algorithmsFile.addImportDeclaration({
  moduleSpecifier: './Vertex',
  defaultImport: 'Vertex'
});

// Add class documentation and declaration
algorithmsFile.addClass({
  name: 'GraphAlgorithms',
  isExported: false,
  docs: [{
    description: `A class providing graph algorithms including bridge detection,
graph traversal, and connected component analysis.`
  }],
  ctors: [{
    parameters: [{
      name: 'graph',
      type: 'Graph',
      isReadonly: true,
      scope: Scope.Private
    }]
  }]
});

// Get the Graph class
const graphClass = graphFile.getClass('Graph');
if (!graphClass) {
  throw new Error('Could not find Graph class');
}

// List of instance methods to extract to GraphAlgorithms
const instanceMethodsToExtract = [
  'getBridges',
  'traverseBF',
  'getTreeDepth',
  'traverseTree',
  '_bridgeDfs'
];

// List of static methods to extract
const staticMethodsToExtract = [
  'getConnectedComponents',
  'getConnectedComponentCount',
  '_ccCountDfs',
  '_ccGetDfs'
];

// Get the new class to add methods to
const algorithmsClass = algorithmsFile.getClass('GraphAlgorithms');
if (!algorithmsClass) {
  throw new Error('Could not create GraphAlgorithms class');
}

// Extract instance methods
for (const methodName of instanceMethodsToExtract) {
  const method = graphClass.getMethod(methodName);
  if (!method) {
    console.warn(`Method ${methodName} not found in Graph class`);
    continue;
  }

  // Determine scope
  const isPrivate = methodName.startsWith('_');
  const scope = isPrivate ? Scope.Private : Scope.Public;

  // Add the method to the new class
  algorithmsClass.addMethod({
    name: methodName,
    scope: scope,
    returnType: method.getReturnType().getText(),
    parameters: method.getParameters().map(p => ({
      name: p.getName(),
      type: p.getType().getText()
    })),
    statements: method.getBodyText() || ''
  });

  console.log(`Extracted instance method: ${methodName}`);
}

// Extract static methods
for (const methodName of staticMethodsToExtract) {
  const method = graphClass.getMethod(methodName);
  if (!method) {
    console.warn(`Static method ${methodName} not found in Graph class`);
    continue;
  }

  // Determine scope
  const isPrivate = methodName.startsWith('_');
  const scope = isPrivate ? Scope.Private : Scope.Public;

  // Add the static method to the new class
  algorithmsClass.addMethod({
    name: methodName,
    scope: scope,
    isStatic: true,
    parameters: method.getParameters().map(p => ({
      name: p.getName(),
      type: p.getType().getText()
    })),
    statements: method.getBodyText() || ''
  });

  console.log(`Extracted static method: ${methodName}`);
}

// Transform `this.` references in the extracted instance methods
const extractedMethods = algorithmsClass.getInstanceMethods();
for (const method of extractedMethods) {
  const methodBody = method.getBodyText();
  if (!methodBody) continue;

  // Replace this.graph references with this.graph.graph for nested access
  // But first, replace specific method calls that should delegate within the class
  let newBody = methodBody
    .replace(/this\.vertices/g, 'this.graph.vertices')
    .replace(/this\.edges/g, 'this.graph.edges')
    .replace(/this\._time/g, 'this.graph._time')
    .replace(/this\.getAdjacencyList\(/g, 'this.graph.getAdjacencyList(')
    .replace(/this\.getTreeDepth\(/g, 'this.getTreeDepth(')  // Recursive within class
    .replace(/this\.traverseTree\(/g, 'this.traverseTree(')  // Recursive within class
    .replace(/this\._bridgeDfs\(/g, 'this._bridgeDfs(');     // Private call within class

  method.setBodyText(newBody);
}

// Add export statement
algorithmsFile.addExportAssignment({
  expression: 'GraphAlgorithms'
});

// Now update the Graph class to use the new helper
const existingImport = graphFile.getImportDeclaration(decl =>
  decl.getModuleSpecifierValue() === './GraphAlgorithms'
);

if (!existingImport) {
  graphFile.addImportDeclaration({
    moduleSpecifier: './GraphAlgorithms',
    defaultImport: 'GraphAlgorithms'
  });
}

// Add algorithms property to Graph class
const algorithmsProperty = graphClass.getProperty('algorithms');
if (!algorithmsProperty) {
  // Add after matrixOps property
  const matrixOpsProperty = graphClass.getProperty('matrixOps');
  if (matrixOpsProperty) {
    graphClass.insertProperty(graphClass.getProperties().indexOf(matrixOpsProperty) + 1, {
      name: 'algorithms',
      type: 'GraphAlgorithms'
    });
  } else {
    graphClass.addProperty({
      name: 'algorithms',
      type: 'GraphAlgorithms'
    });
  }
}

// Initialize algorithms in constructor
const constructor = graphClass.getConstructors()[0];
if (constructor) {
  const constructorBody = constructor.getBodyText();
  if (constructorBody && !constructorBody.includes('this.algorithms')) {
    constructor.addStatements('this.algorithms = new GraphAlgorithms(this);');
  }
}

// Replace instance method implementations in Graph with delegation calls
for (const methodName of instanceMethodsToExtract) {
  const method = graphClass.getMethod(methodName);
  if (!method) continue;

  // Get parameter names
  const params = method.getParameters().map(p => p.getName()).join(', ');

  // Create delegation call
  const delegationBody = params
    ? `return this.algorithms.${methodName}(${params});`
    : `return this.algorithms.${methodName}();`;

  method.setBodyText(delegationBody);

  console.log(`Updated ${methodName} to delegate to algorithms`);
}

// Replace static method implementations with delegation to static class methods
for (const methodName of staticMethodsToExtract) {
  const method = graphClass.getMethod(methodName);
  if (!method) continue;

  // Get parameter names
  const params = method.getParameters().map(p => p.getName()).join(', ');

  // Create delegation call to static method
  const delegationBody = params
    ? `return GraphAlgorithms.${methodName}(${params});`
    : `return GraphAlgorithms.${methodName}();`;

  method.setBodyText(delegationBody);

  console.log(`Updated static ${methodName} to delegate to GraphAlgorithms`);
}

// Save all changes
console.log('Saving changes...');
project.saveSync();
console.log('✓ GraphAlgorithms extracted successfully!');
