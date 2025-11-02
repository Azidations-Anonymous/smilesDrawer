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
  'drawText',
  'getChargeText'
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
  methodText = methodText.replace(/\bthis\.(ctx|offsetX|offsetY|opts|themeManager|fontLarge|fontSmall|hydrogenWidth|halfHydrogenWidth|halfBondThickness|colors)\b/g, 'this.wrapper.$1');

  // Keep method calls within the same class as `this.`
  // getChargeText might be called from drawText - keep as `this.getChargeText`

  methodTexts.push(methodText);
  method.remove();
}

// Build the helper class content
const helperClassContent = `import MathHelper = require('../../utils/MathHelper');
import CanvasWrapper = require('../CanvasWrapper');

class CanvasTextRenderer {
  constructor(private wrapper: CanvasWrapper) {}

${methodTexts.join('\n\n')}
}

export = CanvasTextRenderer;
`;

// Create the new helper file
project.createSourceFile('src/drawing/draw/CanvasTextRenderer.ts', helperClassContent, {
  overwrite: true
});

// Add textRenderer field to CanvasWrapper
wrapperClass.insertProperty(wrapperClass.getProperties().length, {
  name: 'textRenderer',
  type: 'CanvasTextRenderer',
  scope: Scope.Private
});

// Initialize in constructor
const constructor = wrapperClass.getConstructors()[0];
if (constructor) {
  const bodyText = constructor.getBodyText();
  constructor.setBodyText(bodyText + '\n        this.textRenderer = new CanvasTextRenderer(this);');
}

// Add delegation methods back to CanvasWrapper
wrapperClass.addMethod({
  name: 'drawText',
  parameters: [
    { name: 'x', type: 'number' },
    { name: 'y', type: 'number' },
    { name: 'elementName', type: 'string' },
    { name: 'hydrogens', type: 'number' },
    { name: 'direction', type: 'string' },
    { name: 'isTerminal', type: 'boolean' },
    { name: 'charge', type: 'number' },
    { name: 'isotope', type: 'number' },
    { name: 'vertexCount', type: 'number' },
    { name: 'attachedPseudoElement', type: 'any', initializer: '{}' }
  ],
  returnType: 'void',
  statements: 'this.textRenderer.drawText(x, y, elementName, hydrogens, direction, isTerminal, charge, isotope, vertexCount, attachedPseudoElement);'
});

wrapperClass.addMethod({
  name: 'getChargeText',
  parameters: [{ name: 'charge', type: 'number' }],
  returnType: 'string',
  statements: 'return this.textRenderer.getChargeText(charge);'
});

// Make fontLarge, fontSmall, hydrogenWidth, halfHydrogenWidth public (accessed by helper)
const propertiesToMakePublic = ['fontLarge', 'fontSmall', 'hydrogenWidth', 'halfHydrogenWidth'];

for (const propName of propertiesToMakePublic) {
  const prop = wrapperClass.getProperty(propName);
  if (prop && prop.getScope() !== Scope.Public) {
    prop.setScope(Scope.Public);
  }
}

// Add import
const lastImport = sourceFile.getImportDeclarations()[sourceFile.getImportDeclarations().length - 1];
if (lastImport) {
  sourceFile.insertText(lastImport.getEnd(), '\nimport CanvasTextRenderer = require(\'./draw/CanvasTextRenderer\');');
}

console.log('Saving changes...');
project.saveSync();

console.log('Extraction complete!');
console.log('Created: src/drawing/draw/CanvasTextRenderer.ts');
console.log('Modified: src/drawing/CanvasWrapper.ts');
console.log('Properties made public: ' + propertiesToMakePublic.join(', '));
