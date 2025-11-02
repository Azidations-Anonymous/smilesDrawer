import { Project, Scope } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: './tsconfig.json'
});

const sourceFile = project.getSourceFile('src/drawing/CanvasWrapper.ts');
if (!sourceFile) {
  throw new Error('Could not find CanvasWrapper.ts');
}

const wrapperClass = sourceFile.getClass('CanvasWrapper');
if (!wrapperClass) {
  throw new Error('Could not find CanvasWrapper class');
}

// Methods to extract
const methodsToExtract = [
  'drawCircle',
  'drawLine',
  'drawBall',
  'drawPoint',
  'drawAromaticityRing',
  'drawDebugText'  // Include this since drawCircle uses it
];

// Collect method texts
const methodTexts: string[] = [];

for (const methodName of methodsToExtract) {
  const method = wrapperClass.getMethod(methodName);
  if (!method) {
    console.warn(`Could not find method ${methodName}`);
    continue;
  }

  let methodText = method.getFullText();

  // Transform all `this.` references to `this.wrapper.`
  // Be careful with method calls - drawDebugText should stay as this.drawDebugText
  methodText = methodText.replace(/\bthis\.(ctx|offsetX|offsetY|opts|themeManager|halfBondThickness|colors)\b/g, 'this.wrapper.$1');

  // Keep method calls within the same class as `this.`
  // drawCircle calls this.drawDebugText - keep as is since both are in same class

  methodTexts.push(methodText);
  method.remove();
}

// Build the helper class content
const helperClassContent = `import MathHelper = require('../../utils/MathHelper');
import CanvasWrapper = require('../CanvasWrapper');

class CanvasPrimitiveDrawer {
  constructor(private wrapper: CanvasWrapper) {}

${methodTexts.join('\n\n')}
}

export = CanvasPrimitiveDrawer;
`;

// Create the new helper file
project.createSourceFile('src/drawing/draw/CanvasPrimitiveDrawer.ts', helperClassContent, {
  overwrite: true
});

// Add primitiveDrawer field to CanvasWrapper
wrapperClass.insertProperty(wrapperClass.getProperties().length, {
  name: 'primitiveDrawer',
  type: 'CanvasPrimitiveDrawer',
  scope: Scope.Private
});

// Initialize in constructor
const constructor = wrapperClass.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText();
  constructor.setBodyText(bodyText + '\n        this.primitiveDrawer = new CanvasPrimitiveDrawer(this);');
}

// Add delegation methods back to CanvasWrapper
const methodSignatures: Record<string, any> = {
  drawCircle: {
    parameters: [
      { name: 'x', type: 'number' },
      { name: 'y', type: 'number' },
      { name: 'radius', type: 'number' },
      { name: 'color', type: 'string' },
      { name: 'fill', type: 'boolean', initializer: 'true' },
      { name: 'debug', type: 'boolean', initializer: 'false' },
      { name: 'debugText', type: 'string', initializer: "''" }
    ],
    returnType: 'void',
    statement: 'this.primitiveDrawer.drawCircle(x, y, radius, color, fill, debug, debugText);'
  },
  drawLine: {
    parameters: [
      { name: 'line', type: 'any' },
      { name: 'dashed', type: 'boolean', initializer: 'false' },
      { name: 'alpha', type: 'number', initializer: '1.0' }
    ],
    returnType: 'void',
    statement: 'this.primitiveDrawer.drawLine(line, dashed, alpha);'
  },
  drawBall: {
    parameters: [
      { name: 'x', type: 'number' },
      { name: 'y', type: 'number' },
      { name: 'elementName', type: 'string' }
    ],
    returnType: 'void',
    statement: 'this.primitiveDrawer.drawBall(x, y, elementName);'
  },
  drawPoint: {
    parameters: [
      { name: 'x', type: 'number' },
      { name: 'y', type: 'number' },
      { name: 'elementName', type: 'string' }
    ],
    returnType: 'void',
    statement: 'this.primitiveDrawer.drawPoint(x, y, elementName);'
  },
  drawAromaticityRing: {
    parameters: [{ name: 'ring', type: 'any' }],
    returnType: 'void',
    statement: 'this.primitiveDrawer.drawAromaticityRing(ring);'
  },
  drawDebugText: {
    parameters: [
      { name: 'x', type: 'number' },
      { name: 'y', type: 'number' },
      { name: 'text', type: 'string' }
    ],
    returnType: 'void',
    statement: 'this.primitiveDrawer.drawDebugText(x, y, text);'
  }
};

for (const methodName of methodsToExtract) {
  const sig = methodSignatures[methodName];
  if (sig) {
    wrapperClass.addMethod({
      name: methodName,
      parameters: sig.parameters,
      returnType: sig.returnType,
      statements: sig.statement
    });
  }
}

// Add import
const lastImport = sourceFile.getImportDeclarations()[sourceFile.getImportDeclarations().length - 1];
if (lastImport) {
  sourceFile.insertText(lastImport.getEnd(), '\nimport CanvasPrimitiveDrawer = require(\'./draw/CanvasPrimitiveDrawer\');');
}

console.log('Saving changes...');
project.saveSync();

console.log('Extraction complete!');
console.log('Created: src/drawing/draw/CanvasPrimitiveDrawer.ts');
console.log('Modified: src/drawing/CanvasWrapper.ts');
