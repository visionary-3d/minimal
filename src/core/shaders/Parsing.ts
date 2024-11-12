/// <reference types="@webgpu/types" />

import { Shader } from "./Shader";

// Core constants
const DECORATORS = {
  texture: "@texture", // creator decorator for textures and storage textures
  buffer: "@buffer", // creator decorator for storage buffers
  uniform: "@uniform", // creator decorator for uniform buffers
  ref: "@ref",
  sampler: "@sampler",
  size: "@size", // serves different purpose as parameter for different creator decorators
  format: "@format", // used for texture format creation
  stride: "@stride", // used for storage buffer creation
  group: "@group", // default wgsl decorator, which we'll handle implicitly and explicitly
  binding: "@binding", // default wgsl decorator, which we'll handle implicitly and explicitly
  addressModeU: "@addressModeU",
  addressModeV: "@addressModeV",
  addressModeW: "@addressModeW",
  magFilter: "@magFilter",
  minFilter: "@minFilter",
  mipmapFilter: "@mipmapFilter",
  lodMinClamp: "@lodMinClamp",
  lodMaxClamp: "@lodMaxClamp",
  compare: "@compare",
  maxAnisotropy: "@maxAnisotropy",
} as const;

export class WildCard {
  shaders: Shader[] = [];

  constructor(public readonly name: string, public value: number[]) {
    if (value.length < 1 || value.length > 4) {
      throw new Error(`WildCard value must have 1-4 components, got ${value.length}`);
    }
  }

  addDependency(shader: Shader) {
    this.shaders.push(shader);
  }

  set(...values: number[]) {
    this.value = values;

    for (let i = 0; i < this.shaders.length; i++) {
      const s = this.shaders[i];
      s.markReset();
    }
  }

  get type(): string {
    switch (this.value.length) {
      case 1:
        return "f32";
      case 2:
        return "vec2<f32>";
      case 3:
        return "vec3<f32>";
      case 4:
        return "vec4<f32>";
      default:
        throw new Error("Invalid vector size");
    }
  }
}

// Replace the existing WILDCARDS constant with:
const WILDCARDS_PREFIX = "info." as const;

// New helper function to handle wildcard evaluation
function evaluateWildcardExpression(expression: string, wildcards: WildCard[]): number[] {
  // Find all wildcard usages in the expression
  const wildcardPattern = new RegExp(`${WILDCARDS_PREFIX}(\\w+)(\\.[xyzwrgba]+)?`, "g");
  const matches = [...expression.matchAll(wildcardPattern)];

  if (matches.length === 0) {
    // If no wildcards, evaluate as regular math expression
    const value = evaluateMathExpression(expression);
    return [value];
  }

  let evalExp = expression;

  // First pass: Replace wildcards with their actual values
  for (const match of matches) {
    const [fullMatch, wildcardName, swizzle] = match;
    const wildcard = wildcards.find((w) => w.name === wildcardName);

    if (!wildcard) {
      throw new Error(`Unknown wildcard: ${wildcardName}`);
    }

    const values = swizzle ? getSwizzledValue(wildcard.value, swizzle) : wildcard.value;

    // If we're in a math expression and have single value, don't wrap in array
    if (values.length === 1) {
      evalExp = evalExp.replace(fullMatch, values[0].toString());
    } else {
      // For vector operations, we'll need to handle each component separately
      return values.map((v) => {
        // Replace the wildcard with this specific component value and evaluate
        const componentExp = evalExp.replace(fullMatch, v.toString());
        return evaluateMathExpression(componentExp);
      });
    }
  }

  // At this point, all wildcards have been replaced with actual numbers
  // We can now evaluate the entire expression
  return evalExp.split(",").map((exp) => evaluateMathExpression(exp.trim()));
}
const VALID_TEXTURE_TYPES = [
  "texture_1d",
  "texture_2d",
  "texture_2d_array",
  "texture_3d",
  "texture_cube",
  "texture_cube_array",
  "texture_multisampled_2d",
  "texture_storage_1d",
  "texture_storage_2d",
  "texture_storage_2d_array",
  "texture_storage_3d",
  "texture_depth_2d",
  "texture_depth_2d_array",
  "texture_depth_cube",
  "texture_depth_cube_array",
  "texture_depth_multisampled_2d",
] as const;

type TextureType = (typeof VALID_TEXTURE_TYPES)[number];

const VALID_STORAGE_ACCESS = ["read", "read_write"] as const;
type StorageAccess = (typeof VALID_STORAGE_ACCESS)[number];

const VALID_ADDRESS_MODES = ["repeat", "mirror-repeat", "clamp-to-edge"] as const;
const VALID_FILTER_MODES = ["nearest", "linear"] as const;
const VALID_COMPARE_FUNCTIONS = [
  "never",
  "less",
  "equal",
  "less-equal",
  "greater",
  "not-equal",
  "greater-equal",
  "always",
] as const;

type AddressMode = GPUAddressMode;
type FilterMode = (typeof VALID_FILTER_MODES)[number];
type CompareFunction = (typeof VALID_COMPARE_FUNCTIONS)[number];

const SWIZZLE_COMPONENTS = {
  x: 0,
  y: 1,
  z: 2,
  w: 3,
  r: 0,
  g: 1,
  b: 2,
  a: 3,
} as const;

function getSwizzledValue(value: number[], accessor: string): number[] {
  if (!accessor || accessor.length === 0) return value;

  // Handle first array indexing
  const arrayMatches = [...accessor.matchAll(/\[(\d+)\]/g)];
  if (arrayMatches.length > 0) {
    const index = parseInt(arrayMatches[0][1], 10);
    const matrixDim = Math.sqrt(value.length);
    const rowStart = index * matrixDim;
    value = value.slice(rowStart, rowStart + matrixDim);

    // Handle second array index if it exists
    if (arrayMatches.length > 1) {
      const secondIndex = parseInt(arrayMatches[1][1], 10);
      return [value[secondIndex]];
    }

    // Remove the array part from accessor for potential swizzling
    accessor = accessor.replace(/\[\d+\](?:\[\d+\])?/, "");
  }

  // Handle swizzling if there's any left after array access
  const swizzle = accessor.replace(/^\./, "");
  if (!swizzle) return value;

  return swizzle.split("").map((component) => {
    const idx = SWIZZLE_COMPONENTS[component as keyof typeof SWIZZLE_COMPONENTS];
    return value[idx];
  });
}

const decoratorPattern = (decorator: string, captureContent = true) =>
  `${decorator}\\s*\\(${captureContent ? "([^\\)]+)" : ""}\\)`;

const textureVariablePattern = () =>
  // Pattern for texture variables specifically, including storage textures
  new RegExp(`\\s*var\\s+(?<name>\\w+)\\s*:\\s*(?<type>texture_(?:storage_)?(?:1d|2d|3d|cube)(?:_array)?(?:<[^>]+>)?)`);

const storageBufferVariablePattern = () =>
  // Pattern specifically for storage buffer variables
  new RegExp(
    `\\s*var\\s*<\\s*storage\\s*,\\s*(${VALID_STORAGE_ACCESS.join("|")})\\s*>\\s+(?<name>\\w+)\\s*:\\s*(?<type>[^;]+)`
  );

const uniformVariablePattern = () =>
  // Pattern for uniform variables with named capture groups
  new RegExp(`var\\s*<\\s*uniform\\s*>\\s+(?<name>\\w+)\\s*:\\s*(?<type>\\w+)`);

const linePattern = (decorator: string) => new RegExp(`${decorator}[^;]*;`, "g");

const PATTERNS = {
  textureLinePattern: linePattern(DECORATORS.texture),
  bufferLinePattern: linePattern(DECORATORS.buffer),
  uniformLinePattern: linePattern(DECORATORS.uniform),
  sizeDecorator: decoratorPattern(DECORATORS.size),
  formatDecorator: decoratorPattern(DECORATORS.format),
  groupDecorator: decoratorPattern(DECORATORS.group),
  bindingDecorator: decoratorPattern(DECORATORS.binding),
  strideDecorator: decoratorPattern(DECORATORS.stride),
  textureVariable: textureVariablePattern(),
  storageBufferVariable: storageBufferVariablePattern(),
  uniformVariablePattern: uniformVariablePattern(),
  nestedDecoratorsPattern: `@(\\w+)\\s*\\(([^)]+)\\)`,
  samplerLinePattern: linePattern(DECORATORS.sampler),
  samplerVariable: `\\s*var\\s+(?<name>\\w+)\\s*:\\s*sampler`,
  // New pattern for nested sampler decorators that handles math expressions and wildcards
  nestedSamplerDecoratorPattern: "@(\\w+)\\s*\\(([^@)]*(?:@[^)]*\\)|[^)]*)*)\\)",
  refLinePattern: linePattern(DECORATORS.ref),
  refTextureVariable:
    /\s*var\s+(?<name>\w+)\s*:\s*(?<type>texture_(?:storage_)?(?:1d|2d|3d|cube)(?:_array)?(?:<[^>]+>)?)/,
  refStorageVariable: /\s*var\s*<\s*storage\s*,\s*(?<access>read|read_write)\s*>\s+(?<name>\w+)\s*:\s*(?<type>[^;]+)/,
  refUniformVariable: /\s*var\s*<\s*uniform\s*>\s+(?<name>\w+)\s*:\s*(?<type>\w+)/,
  refSamplerVariable: /\s*var\s+(?<name>\w+)\s*:\s*sampler/,
};

// Types

export enum RESOURCE_TYPE {
  TEX = "texture",
  BUF = "buffer",
  UNI = "uniform",
  SAMP = "sampler",
  REF = "ref",
}

// Base interface for all GPU resources
interface ResourceBase {
  name: string;
  group: number;
  binding: number;
  declarationIndex: number;
  wildcards: string[]; // Array of used wildcards
  resourceType: RESOURCE_TYPE;
  usedInBody: boolean;
}

// Texture-specific properties
interface TextureObject extends ResourceBase {
  size: number[];
  format: string;
  type: string;
}

// Buffer-specific properties
interface BufferObject extends ResourceBase {
  size: number;
  type: string;
  access: string;
  stride?: number;
}

interface UniformObject extends ResourceBase {
  type: string;
  defaults: Record<string, number[]>;
  size: number;
}

interface SamplerObject extends ResourceBase {
  addressModeU?: AddressMode;
  addressModeV?: AddressMode;
  addressModeW?: AddressMode;
  magFilter?: FilterMode;
  minFilter?: FilterMode;
  mipmapFilter?: FilterMode;
  lodMinClamp?: number;
  lodMaxClamp?: number;
  compare?: CompareFunction;
  maxAnisotropy?: number;
}

// Resource type categories for validation
const RESOURCE_TYPE_PATTERNS = {
  texture: /^texture_(?:storage_)?(?:1d|2d|3d|cube)(?:_array)?(?:<[^>]+>)?$/,
  storage: /^(?:array<[^>]+>|struct\s+\w+\s*\{[^}]+\})$/,
  uniform: /^\w+$/, // Struct name for uniform buffers
  sampler: /^sampler$/,
} as const;

type ResourceCategory = keyof typeof RESOURCE_TYPE_PATTERNS;

interface ReferenceObject extends ResourceBase {
  name: string; // Local variable name
  node: string; // Name of the referenced node
  ref: string; // Name of the referenced resource
  type: string; // WGSL type
  category: ResourceCategory; // Type of resource being referenced
  access?: StorageAccess; // For storage buffers only
}

type ValidationError = Readonly<{
  message: string;
  line?: number;
}>;

type ParsedDecorators = Readonly<{
  size: string[];
  format: string;
  group?: number;
  binding?: number;
}>;

function removeComments(shader: string) {
  return shader.replace(/\/\*(?:[^*]|\**[^*/])*\*+\/|\/\/.*/g, "");
}

// Pure validation functions
const validateTextureDeclaration = (line: string): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check required decorators
  const requiredDecorators = [
    { name: DECORATORS.size, pattern: new RegExp(`${DECORATORS.size}\\s*\\(`, "g") },
    { name: DECORATORS.format, pattern: new RegExp(`${DECORATORS.format}\\s*\\(`, "g") },
  ];

  requiredDecorators.forEach(({ name, pattern }) => {
    if (!line.match(pattern)) {
      errors.push({ message: `Missing ${name} decorator` });
    }
  });

  // Check parentheses
  const openParens = (line.match(/\(/g) || []).length;
  const closeParens = (line.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push({ message: "Mismatched parentheses" });
  }

  // Check variable declaration
  if (!line.match(/var\s+\w+/)) {
    errors.push({ message: "Missing variable declaration" });
  }

  // Check binding order
  const hasGroup = line.includes(DECORATORS.group);
  const hasBinding = line.includes(DECORATORS.binding);
  if (hasBinding && hasGroup) {
    const groupIndex = line.indexOf(DECORATORS.group);
    const bindingIndex = line.indexOf(DECORATORS.binding);
    if (bindingIndex < groupIndex) {
      errors.push({ message: "When both are present, @group must come before @binding" });
    }
  }

  return errors;
};

// New helper to parse struct fields
const parseStructFields = (structContent: string): string[] => {
  const fieldPattern = /\s*\w+\s*:\s*([^,;]+)/g;
  const matches = [...structContent.matchAll(fieldPattern)];
  return matches.map((match) => match[1].trim());
};

// New helper to validate storage buffer type
const validateStorageBufferType = (declaration: string): string => {
  // Handle direct array declarations
  if (declaration.startsWith("array<")) {
    return declaration;
  }

  // Handle struct declarations
  if (declaration.includes("struct")) {
    const structPattern = /struct\s+\w+\s*\{([^}]+)\}/;
    const match = declaration.match(structPattern);
    if (!match) {
      throw new Error("Invalid struct declaration");
    }
    const fields = parseStructFields(match[1]);
    if (fields.length === 0) {
      throw new Error("Struct must contain at least one field");
    }
    return declaration;
  }

  throw new Error(`Invalid storage buffer type: ${declaration}`);
};

const validateBufferDeclaration = (line: string): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check required decorators
  if (!line.match(new RegExp(`${DECORATORS.size}\\s*\\(`))) {
    errors.push({ message: "Missing @size decorator" });
  }

  // Check storage qualifier
  if (!line.match(/var\s*<\s*storage\s*,\s*(read|read_write)\s*>/)) {
    errors.push({
      message: "Invalid or missing storage qualifier. Must be var<storage, read> or var<storage, read_write>",
    });
  }

  // Check variable declaration
  if (!line.match(/var\s*<[^>]+>\s+\w+/)) {
    errors.push({ message: "Missing or invalid variable declaration" });
  }

  // Validate type declaration
  if (!line.match(/:\s*(array<[^>]+>|struct\s+\w+\s*\{[^}]+\})/)) {
    errors.push({ message: "Invalid type declaration. Must be either array<T> or a struct" });
  }

  // Check parentheses matching
  const openParens = line.match(/[\(\{<]/g)?.length || 0;
  const closeParens = line.match(/[\)\}>]/g)?.length || 0;
  if (openParens !== closeParens) {
    errors.push({
      message: `Mismatched parentheses/braces/brackets: found ${openParens} opening and ${closeParens} closing`,
    });
  }

  return errors;
};

const evaluateMathExpression = (expression: string): number => {
  const cleanExpression = expression.trim();
  if (!cleanExpression) return 0;

  if (/^\d+$/.test(cleanExpression)) {
    return parseInt(cleanExpression, 10);
  }

  // Check for valid characters and balanced parentheses
  if (!/^[\d\s+\-*/().]+$/.test(cleanExpression)) {
    throw new Error(`Invalid math expression: ${cleanExpression}`);
  }

  // Validate parentheses balance
  const openParens = (cleanExpression.match(/\(/g) || []).length;
  const closeParens = (cleanExpression.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    throw new Error(
      `Unbalanced parentheses in expression: ${cleanExpression} (${openParens} opening, ${closeParens} closing)`
    );
  }

  try {
    const result = Function(`return ${cleanExpression}`)();
    if (!Number.isFinite(result)) {
      throw new Error(`Expression resulted in invalid number: ${cleanExpression}`);
    }
    return result;
  } catch (error: any) {
    throw new Error(`Failed to evaluate expression "${cleanExpression}": ${error.message}`);
  }
};

const evaluateResolutionExpression = (input: string, expectedDimensions: number, wildcards: WildCard[]): number[] => {
  const expression = input.trim();

  if (/^\d+$/.test(expression)) {
    const value = parseInt(expression, 10);
    return Array(expectedDimensions).fill(value);
  }

  // Check if expression contains any wildcards
  const hasWildcard = wildcards.some((w) => expression.includes(WILDCARDS_PREFIX + w.name));
  if (hasWildcard) {
    return evaluateWildcardExpression(expression, wildcards);
  }

  const value = evaluateMathExpression(expression);
  return Array(expectedDimensions).fill(value);
};

const getExpectedDimensions = (textureType: string): number => {
  if (textureType.includes("1d")) return 1;
  if (textureType.includes("3d") || textureType.includes("array")) return 3;
  return 2;
};

const validateAndResolveTextureSize = (
  sizeParams: string[],
  textureType: string,
  lineIndex: number,
  wildcards: WildCard[]
): number[] => {
  const expectedDimensions = getExpectedDimensions(textureType);

  try {
    // Handle both single and multiple parameters
    let resolvedSizes: number[];

    if (sizeParams.length === 1) {
      resolvedSizes = evaluateResolutionExpression(sizeParams[0], 1, wildcards).flat();
    } else {
      resolvedSizes = sizeParams.map((param) => evaluateResolutionExpression(param, 1, wildcards)).flat();
    }

    // Validate number of dimensions
    if (resolvedSizes.length > expectedDimensions) {
      throw new Error(
        `Incorrect number of dimensions for ${textureType}: ` +
          `expected ${expectedDimensions} ${expectedDimensions === 1 ? "value" : "values"} ` +
          `but got ${resolvedSizes.length} (${resolvedSizes.join(", ")})`
      );
    }

    if (resolvedSizes.length < expectedDimensions) {
      if (textureType.includes("array")) {
        throw new Error(
          `Insufficient dimensions for ${textureType}: ` +
            `expected ${expectedDimensions} values (width, height, array_size) ` +
            `but got ${resolvedSizes.length} (${resolvedSizes.join(", ")})`
        );
      }
      // For non-array textures, pad with the last value
      const lastValue = resolvedSizes[resolvedSizes.length - 1];
      while (resolvedSizes.length < expectedDimensions) {
        resolvedSizes.push(lastValue);
      }
    }

    // Validate individual values
    resolvedSizes.forEach((size, index) => {
      if (!Number.isFinite(size)) {
        throw new Error(`Invalid resolution at position ${index + 1}: value is not a finite number`);
      }
      if (size <= 0) {
        throw new Error(`Invalid resolution at position ${index + 1}: value must be greater than 0, got ${size}`);
      }
      // Additional validation for array size
      if (textureType.includes("array") && index === 2 && !Number.isInteger(size)) {
        throw new Error(`Array size (dimension 3) must be an integer, got ${size}`);
      }
    });

    return resolvedSizes;
  } catch (error: any) {
    const dimensionStr = expectedDimensions === 1 ? "dimension" : "dimensions";
    const providedValues = sizeParams.join(", ");
    throw new Error(
      `Resolution error for ${textureType} at position ${lineIndex}: ${error.message}\n` +
        `Note: ${textureType} requires ${expectedDimensions} ${dimensionStr}. ` +
        `Provided values: [${providedValues}]`
    );
  }
};

// Helper function to extract stride from buffer type if present
const getBufferStride = (bufferType: string): number | undefined => {
  const match = bufferType.match(/structured<(\d+)>/);
  return match ? parseInt(match[1], 10) : undefined;
};

const validateAndResolveBufferSize = (
  sizeParams: string[],
  bufferType: string,
  lineIndex: number,
  wildcards: WildCard[]
): number => {
  try {
    // Buffer size should always be a single parameter
    // Evaluate the size expression
    const resolvedSize = evaluateResolutionExpression(sizeParams[0], 1, wildcards).flat();

    if (resolvedSize.length !== 1) {
      throw new Error(
        `Buffer size must be a single value, but got ${resolvedSize.length} parameters: [${sizeParams.join(", ")}]`
      );
    }

    const resolved = resolvedSize[0];

    // Validate the size value
    if (!Number.isFinite(resolved)) {
      throw new Error("Buffer size must be a finite number");
    }

    if (resolved <= 0) {
      throw new Error(`Buffer size must be greater than 0, got ${resolved}`);
    }

    if (!Number.isInteger(resolved)) {
      throw new Error(`Buffer size must be an integer, got ${resolved}`);
    }

    // For structured buffers, validate size is multiple of stride if stride is specified
    if (bufferType.includes("structured")) {
      const stride = getBufferStride(bufferType);
      if (stride && resolved % stride !== 0) {
        throw new Error(`Buffer size (${resolved}) must be a multiple of stride (${stride})`);
      }
    }

    return resolved;
  } catch (error: any) {
    throw new Error(
      `Size error for buffer at position ${lineIndex}: ${error.message}\n` + `Provided value: [${sizeParams[0]}]`
    );
  }
};

const parseTextureDecorators = (line: string): ParsedDecorators => {
  const matches = {
    size: line.match(PATTERNS.sizeDecorator),
    format: line.match(PATTERNS.formatDecorator),
    group: line.match(PATTERNS.groupDecorator),
    binding: line.match(PATTERNS.bindingDecorator),
  };

  if (!matches.size || !matches.format) {
    throw new Error("Missing required decorators (@size or @format)");
  }

  const sizeParams = matches.size[1].split(",").map((param) => param.trim());

  return {
    size: sizeParams,
    format: matches.format[1],
    group: matches.group ? parseInt(matches.group[1], 10) : undefined,
    binding: matches.binding ? parseInt(matches.binding[1], 10) : undefined,
  };
};

const parseBufferDecorators = (line: string) => {
  const matches = {
    size: line.match(PATTERNS.sizeDecorator),
    stride: line.match(PATTERNS.strideDecorator),
    group: line.match(PATTERNS.groupDecorator),
    binding: line.match(PATTERNS.bindingDecorator),
  };

  if (!matches.size) {
    throw new Error("Missing required @size decorator");
  }

  const sizeParams = matches.size[1].split(",").map((param) => param.trim());

  return {
    size: sizeParams,
    stride: matches.stride ? parseInt(matches.stride[1], 10) : undefined,
    group: matches.group ? parseInt(matches.group[1], 10) : undefined,
    binding: matches.binding ? parseInt(matches.binding[1], 10) : undefined,
  };
};

// Helper function to extract wildcards from expressions
function extractWildcards(expression: string, wildcards: WildCard[]): string[] {
  const extractedWildcards = new Set<string>();

  wildcards.forEach((wildcard) => {
    const wildcardPattern = new RegExp(`${WILDCARDS_PREFIX}${wildcard.name}(?:\\.[xyzwrgba]+)?`, "g");
    if (wildcardPattern.test(expression)) {
      extractedWildcards.add(`${WILDCARDS_PREFIX}${wildcard.name}`);
    }
  });

  return Array.from(extractedWildcards);
}

// Helper to collect wildcards from size parameters
function collectSizeWildcards(sizeParams: string[], wildcards: WildCard[]): string[] {
  const collectedWildcards = new Set<string>();

  sizeParams.forEach((param) => {
    extractWildcards(param, wildcards).forEach((wildcard) => collectedWildcards.add(wildcard));
  });

  return Array.from(collectedWildcards);
}
// Helper function to check if a resource is used in shader functions
const checkResourceUsageInBody = (code: string, resourceName: string): boolean => {
  // First, split the code into sections
  const sections = code.split("\n");

  // Find function bodies (between braces)
  let inFunction = false;
  let braceCount = 0;
  let functionBody = "";

  for (const line of sections) {
    if (line.includes("fn ")) {
      inFunction = true;
    }

    if (inFunction) {
      functionBody += line + "\n";
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (braceCount === 0 && functionBody.includes("{")) {
        inFunction = false;
        // Check if resource is used in this function
        const namePattern = new RegExp(`\\b${resourceName}\\b`);
        if (namePattern.test(functionBody)) {
          return true;
        }
        functionBody = "";
      }
    }
  }

  return false;
};

// Update parser functions to track wildcards:

// For textures
const parseTextureDeclaration = (
  line: string,
  index: number,
  fullCode: string,
  wildcards: WildCard[]
): TextureObject | null => {
  const errors = validateTextureDeclaration(line);
  if (errors.length > 0) {
    errors.forEach((err) => console.error(`Texture at position ${index}: ${err.message}`));
    console.error("Original declaration:\n" + line.trim());
    return null;
  }

  try {
    const decorators = parseTextureDecorators(line);
    const variableMatch = line.match(PATTERNS.textureVariable);

    if (!variableMatch) {
      throw new Error("Invalid texture declaration syntax");
    }

    const { name, type } = variableMatch.groups as any;
    const textureType = validateTextureType(type);
    const resolution = validateAndResolveTextureSize(decorators.size, textureType, index, wildcards);

    // Collect wildcards from size parameters
    const sizes = collectSizeWildcards(decorators.size, wildcards);
    const usedInBody = checkResourceUsageInBody(fullCode, name);

    return {
      resourceType: RESOURCE_TYPE.TEX,
      name,
      size: resolution,
      format: decorators.format,
      type: textureType,
      group: decorators.group || 0,
      binding: decorators.binding || -1,
      declarationIndex: index,
      wildcards: sizes,
      usedInBody,
    };
  } catch (error: any) {
    console.error(`Texture at position ${index}: ${error.message}`);
    return null;
  }
};
const computeBindingIndices = (resources: ResourceBase[]): ResourceBase[] => {
  if (resources.length == 0) return [];

  const maxGroupIndex = Math.max(...resources.map((t) => t.group));
  const groupBindings = Array(maxGroupIndex + 1).fill(0);
  const usedBindings = new Set<string>();

  const getNextBinding = (group: number): number => {
    while (resources.some((tex) => tex.binding === groupBindings[group] && tex.group === group)) {
      groupBindings[group]++;
    }
    return groupBindings[group]++;
  };

  const texturesWithBindings = resources.map((texture) => ({
    ...texture,
    binding: texture.binding === -1 ? getNextBinding(texture.group) : texture.binding,
  }));

  texturesWithBindings.forEach((texture) => {
    const bindingKey = `${texture.group}:${texture.binding}`;
    if (usedBindings.has(bindingKey)) {
      console.error(
        `Duplicate binding (${texture.binding}) in group ${texture.group}`,
        `at position ${texture.declarationIndex}`
      );
    }
    usedBindings.add(bindingKey);
  });

  return texturesWithBindings.sort((a, b) => (a.group !== b.group ? a.group - b.group : a.binding - b.binding));
};

const parseTextures = (code: string, wildcards: WildCard[]) => {
  const textureLines = code.match(PATTERNS.textureLinePattern) || [];

  if (!textureLines.length) {
    return [];
  }

  const parsedTextures = textureLines
    .map((line, index) => parseTextureDeclaration(line, index, code, wildcards))
    .filter((texture): texture is TextureObject => texture !== null);

  return parsedTextures;
};

// Parse buffers from code
const parseBuffers = (code: string, wildcards: WildCard[]) => {
  const bufferLines = code.match(PATTERNS.bufferLinePattern) || [];

  if (!bufferLines.length) {
    return [];
  }

  const parsedBuffers = bufferLines
    .map((line, index) => parseBufferDeclaration(line, index, wildcards))
    .filter((buffer): buffer is BufferObject => buffer !== null);

  return parsedBuffers;
};

const validateTextureType = (textureTypeDeclaration: string) => {
  const textureType = textureTypeDeclaration.split("<")[0];

  // Check if the texture type is valid
  if (!VALID_TEXTURE_TYPES.includes(textureType as TextureType)) {
    throw new Error(`Invalid texture type: ${textureType}`);
  }

  return textureTypeDeclaration;
};

const parseBufferDeclaration = (line: string, index: number, wildcards: WildCard[]): BufferObject | null => {
  const errors = validateBufferDeclaration(line);
  if (errors.length > 0) {
    errors.forEach((err) => console.error(`Buffer at position ${index}: ${err.message}`));
    console.error("Original declaration:\n" + line.trim());
    return null;
  }

  try {
    const decorators = parseBufferDecorators(line);
    const variableMatch = line.match(PATTERNS.storageBufferVariable);

    if (!variableMatch) {
      throw new Error("Invalid storage buffer declaration syntax");
    }

    const { name, type } = variableMatch.groups as any;
    const bufferType = validateStorageBufferType(type);
    const resolvedSize = validateAndResolveBufferSize(decorators.size, bufferType, index, wildcards);

    // Collect wildcards from size parameters
    const sizes = collectSizeWildcards(decorators.size, wildcards);

    return {
      usedInBody: true,
      resourceType: RESOURCE_TYPE.BUF,
      name,
      type: bufferType,
      size: resolvedSize,
      stride: decorators.stride,
      group: decorators.group || 0,
      binding: decorators.binding || -1,
      declarationIndex: index,
      access: variableMatch[1] as StorageAccess,
      wildcards: sizes,
    };
  } catch (error: any) {
    console.error(`Buffer at position ${index}: ${error.message}`);
    return null;
  }
};

// Helper to parse struct fields with their types
const parseUniformStructFields = (structContent: string): Record<string, string> => {
  const fieldPattern = /\s*(\w+)\s*:\s*([^,;]+)/g;
  const fields: Record<string, string> = {};
  let match;

  while ((match = fieldPattern.exec(structContent)) !== null) {
    fields[match[1].trim()] = match[2].trim();
  }

  return fields;
};

const validateUniformDeclaration = (line: string): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check storage qualifier
  if (!line.match(/var\s*<\s*uniform\s*>/)) {
    errors.push({
      message: "Invalid or missing uniform qualifier. Must be var<uniform>",
    });
  }

  // Check variable declaration
  if (!line.match(/var\s*<[^>]+>\s+\w+/)) {
    errors.push({ message: "Missing or invalid variable declaration" });
  }

  // Check struct type declaration
  if (!line.match(/:\s*\w+/)) {
    errors.push({ message: "Missing or invalid struct type reference" });
  }

  return errors;
};

const validateAndResolveUniformValues = (
  fieldType: string,
  values: string[],
  lineIndex: number,
  wildcards: WildCard[]
): number[] => {
  try {
    // Determine expected number of components based on type
    const componentCounts: Record<string, number> = {
      f32: 1,
      "vec2<f32>": 2,
      "vec3<f32>": 3,
      "vec4<f32>": 4,
    };

    const expectedComponents = componentCounts[fieldType];
    if (!expectedComponents) {
      throw new Error(`Unsupported uniform type: ${fieldType}`);
    }

    // Evaluate each value, handling resolution wildcards
    const resolvedValues = values.map((value) => evaluateResolutionExpression(value, 1, wildcards)).flat();

    if (resolvedValues.length !== expectedComponents) {
      throw new Error(
        `Invalid number of values for ${fieldType}: expected ${expectedComponents}, got ${resolvedValues.length}`
      );
    }

    return resolvedValues;
  } catch (error: any) {
    throw new Error(
      `Value error for uniform at position ${lineIndex}: ${error.message}\n` + `Provided values: [${values.join(", ")}]`
    );
  }
};

const parseUniformStruct = (code: string, structName: string): Record<string, string> => {
  const match = code.match(`struct\\s+${structName}\\s*{([^}]+)}`);

  if (!match) {
    throw new Error(`Could not find struct definition for ${structName}`);
  }

  return parseUniformStructFields(match[1]);
};

const parseUniformParameterDecorators = (uniformString: string): Record<string, string[]> => {
  // Find the content inside @uniform(...) first
  const uniformContentMatch = uniformString.match(`${DECORATORS.uniform}\\s*\\((.*)\\)`);
  if (!uniformContentMatch) {
    throw new Error(`Invalid ${DECORATORS.uniform} decorator format`);
  }

  const parameters: Record<string, string[]> = {};
  const content = uniformContentMatch[1];

  // Match nested decorators like @color(...) within the @uniform content
  const nestedDecoratorPattern = new RegExp(PATTERNS.nestedDecoratorsPattern, "g");
  let match;

  while ((match = nestedDecoratorPattern.exec(content)) !== null) {
    const [, name, values] = match;
    parameters[name] = values.split(",").map((v) => v.trim());
  }

  return parameters;
};

type UniformParsedDecorators = Readonly<{
  fieldValues: Record<string, string[]>;
  group?: number;
  binding?: number;
}>;

// Add separate function to parse uniform decorators
const parseUniformDecorators = (line: string): UniformParsedDecorators => {
  const matches = {
    group: line.match(PATTERNS.groupDecorator),
    binding: line.match(PATTERNS.bindingDecorator),
  };

  // Parse field decorators from within uniform decorator
  const fieldDecorators = parseUniformParameterDecorators(line);

  return {
    fieldValues: fieldDecorators,
    group: matches.group ? parseInt(matches.group[1], 10) : undefined,
    binding: matches.binding ? parseInt(matches.binding[1], 10) : undefined,
  };
};

const parseUniformDeclaration = (
  code: string,
  line: string,
  index: number,
  wildcards: WildCard[]
): UniformObject | null => {
  const errors = validateUniformDeclaration(line);
  if (errors.length > 0) {
    errors.forEach((err) => console.error(`Uniform at position ${index}: ${err.message}`));
    console.error("Original declaration:\n" + line.trim());
    return null;
  }

  try {
    const uniformMatch = line.match(PATTERNS.uniformVariablePattern);

    if (!uniformMatch) {
      throw new Error("Invalid uniform declaration syntax");
    }

    const { name, type } = uniformMatch.groups as any;
    const structFields = parseUniformStruct(code, type);
    const decorators = parseUniformDecorators(line);
    const defaults: Record<string, number[]> = {};
    let totalSize = 0;
    const wilds = new Set<string>();

    for (const [fieldName, fieldType] of Object.entries(structFields)) {
      if (decorators.fieldValues[fieldName]) {
        defaults[fieldName] = validateAndResolveUniformValues(
          fieldType,
          decorators.fieldValues[fieldName],
          index,
          wildcards
        );
        // Collect wildcards from each field's values
        decorators.fieldValues[fieldName].forEach((value) => {
          extractWildcards(value, wildcards).forEach((wildcard) => wilds.add(wildcard));
        });
      } else {
        throw new Error(`Missing default value for field '${fieldName}'`);
      }
      totalSize += getWGSLTypeSize(fieldType);
    }

    return {
      usedInBody: true,
      resourceType: RESOURCE_TYPE.UNI,
      name,
      type,
      defaults,
      size: totalSize,
      group: decorators.group || 0,
      binding: decorators.binding || -1,
      declarationIndex: index,
      wildcards: Array.from(wilds),
    };
  } catch (error: any) {
    console.error(`Uniform at position ${index}: ${error.message}`);
    return null;
  }
};
const parseUniforms = (code: string, wildcards: WildCard[]) => {
  const uniformLines = code.match(PATTERNS.uniformLinePattern) || [];

  if (!uniformLines.length) {
    return [];
  }

  const parsedUniforms = uniformLines
    .map((line, index) => parseUniformDeclaration(code, line, index, wildcards))
    .filter((uniform): uniform is UniformObject => uniform !== null);

  return parsedUniforms;
};

const validateSamplerParameter = (param: string, validValues: readonly string[], paramName: string): string => {
  if (!validValues.includes(param as any)) {
    throw new Error(`Invalid ${paramName} value: "${param}". Must be one of: ${validValues.join(", ")}`);
  }
  return param;
};

const validateSamplerDeclaration = (line: string): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check variable declaration
  if (!line.match(/var\s+\w+/)) {
    errors.push({ message: "Missing variable declaration" });
  }

  // Check sampler type
  if (!line.match(/:\s*sampler/)) {
    errors.push({ message: "Invalid or missing sampler type declaration" });
  }

  // Check binding order if both present
  const hasGroup = line.includes(DECORATORS.group);
  const hasBinding = line.includes(DECORATORS.binding);
  if (hasBinding && hasGroup) {
    const groupIndex = line.indexOf(DECORATORS.group);
    const bindingIndex = line.indexOf(DECORATORS.binding);
    if (bindingIndex < groupIndex) {
      errors.push({ message: "When both are present, @group must come before @binding" });
    }
  }

  const openParens = line.match(/[\(\{<]/g)?.length || 0;
  const closeParens = line.match(/[\)\}>]/g)?.length || 0;
  if (openParens !== closeParens) {
    errors.push({
      message: `Mismatched parentheses/braces/brackets: found ${openParens} opening and ${closeParens} closing`,
    });
  }

  return errors;
};

const parseSamplerParameterDecorators = (samplerString: string): Record<string, string> => {
  // Get everything between @sampler( and ) at the start of the declaration
  const samplerMatch = samplerString.match(`^${DECORATORS.sampler}\\s*\\((.*?)\\)\\s*var`);
  if (!samplerMatch) {
    return {};
  }

  const parameters: Record<string, string> = {};
  const content = samplerMatch[1];

  // Use the new pattern that properly handles nested expressions
  const decoratorPattern = new RegExp(PATTERNS.nestedSamplerDecoratorPattern, "g");
  let match;

  while ((match = decoratorPattern.exec(content)) !== null) {
    const [, decorator, value] = match;
    parameters[decorator] = value.trim();
  }

  return parameters;
};
type SamplerParsedDecorators = Readonly<{
  parameters: Record<string, string>;
  group?: number;
  binding?: number;
}>;

const parseSamplerDecorators = (line: string): SamplerParsedDecorators => {
  const matches = {
    group: line.match(PATTERNS.groupDecorator),
    binding: line.match(PATTERNS.bindingDecorator),
  };

  const parameters = parseSamplerParameterDecorators(line);

  return {
    parameters,
    group: matches.group ? parseInt(matches.group[1], 10) : undefined,
    binding: matches.binding ? parseInt(matches.binding[1], 10) : undefined,
  };
};

const validateSamplerNumericParameter = (
  value: string,
  min: number,
  max: number,
  paramName: string,
  wildcards: WildCard[]
): number => {
  try {
    // Evaluate using wildcard system
    const resolvedValues = evaluateWildcardExpression(value, wildcards);

    // Sampler parameters should only resolve to a single number
    if (resolvedValues.length !== 1) {
      throw new Error(
        `${paramName} must resolve to a single number, got ${resolvedValues.length} values ` +
          `[${resolvedValues.join(", ")}]`
      );
    }

    const resolvedValue = resolvedValues[0];

    if (!Number.isFinite(resolvedValue)) {
      throw new Error(`${paramName} must resolve to a finite number, got ${resolvedValue}`);
    }

    if (resolvedValue < min || resolvedValue > max) {
      throw new Error(`${paramName} must be between ${min} and ${max}, got ${resolvedValue}`);
    }

    return resolvedValue;
  } catch (error: any) {
    throw new Error(`Invalid ${paramName} expression "${value}": ${error.message}`);
  }
};
const parseSamplerDeclaration = (line: string, index: number, wildcards: WildCard[]): SamplerObject | null => {
  const errors = validateSamplerDeclaration(line);
  if (errors.length > 0) {
    errors.forEach((err) => console.error(`Sampler at position ${index}: ${err.message}`));
    console.error("Original declaration:\n" + line.trim());
    return null;
  }

  try {
    const decorators = parseSamplerDecorators(line);
    const variableMatch = line.match(PATTERNS.samplerVariable);

    if (!variableMatch) {
      throw new Error("Invalid sampler declaration syntax");
    }

    const { name } = variableMatch.groups as any;
    const params = decorators.parameters;
    const wilds = new Set<string>();

    // Check numeric parameters for wildcards
    ["lodMinClamp", "lodMaxClamp", "maxAnisotropy"].forEach((param) => {
      if (params[param]) {
        extractWildcards(params[param], wildcards).forEach((wildcard) => wilds.add(wildcard));
      }
    });

    const sampler: SamplerObject = {
      usedInBody: true,
      resourceType: RESOURCE_TYPE.SAMP,
      name,
      group: decorators.group || 0,
      binding: decorators.binding || -1,
      declarationIndex: index,
      wildcards: Array.from(wilds),
    };

    // Add optional parameters (unchanged from original)
    if (params.addressModeU) {
      sampler.addressModeU = validateSamplerParameter(
        params.addressModeU,
        VALID_ADDRESS_MODES,
        "addressModeU"
      ) as AddressMode;
    }
    if (params.addressModeV) {
      sampler.addressModeV = validateSamplerParameter(
        params.addressModeV,
        VALID_ADDRESS_MODES,
        "addressModeV"
      ) as AddressMode;
    }
    if (params.addressModeW) {
      sampler.addressModeW = validateSamplerParameter(
        params.addressModeW,
        VALID_ADDRESS_MODES,
        "addressModeW"
      ) as AddressMode;
    }
    if (params.magFilter) {
      sampler.magFilter = validateSamplerParameter(params.magFilter, VALID_FILTER_MODES, "magFilter") as FilterMode;
    }
    if (params.minFilter) {
      sampler.minFilter = validateSamplerParameter(params.minFilter, VALID_FILTER_MODES, "minFilter") as FilterMode;
    }
    if (params.mipmapFilter) {
      sampler.mipmapFilter = validateSamplerParameter(
        params.mipmapFilter,
        VALID_FILTER_MODES,
        "mipmapFilter"
      ) as FilterMode;
    }
    if (params.compare) {
      sampler.compare = validateSamplerParameter(params.compare, VALID_COMPARE_FUNCTIONS, "compare") as CompareFunction;
    }
    if (params.lodMinClamp) {
      sampler.lodMinClamp = validateSamplerNumericParameter(params.lodMinClamp, 0, 32, "lodMinClamp", wildcards);
    }
    if (params.lodMaxClamp) {
      sampler.lodMaxClamp = validateSamplerNumericParameter(params.lodMaxClamp, 0, 32, "lodMaxClamp", wildcards);
    }
    if (params.maxAnisotropy) {
      sampler.maxAnisotropy = validateSamplerNumericParameter(params.maxAnisotropy, 1, 16, "maxAnisotropy", wildcards);
    }

    return sampler;
  } catch (error: any) {
    console.error(`Sampler at position ${index}: ${error.message}`);
    return null;
  }
};

// Update parseSamplers to pass dimensions
const parseSamplers = (code: string, wildcards: WildCard[]) => {
  const samplerLines = code.match(PATTERNS.samplerLinePattern) || [];

  if (!samplerLines.length) {
    return [];
  }

  const parsedSamplers = samplerLines
    .map((line, index) => parseSamplerDeclaration(line, index, wildcards))
    .filter((sampler): sampler is SamplerObject => sampler !== null);

  return parsedSamplers;
};

const validateReferenceFormat = (reference: string): boolean => {
  const pattern = /^[a-zA-Z_]\w*\.[a-zA-Z_]\w*$/;
  return pattern.test(reference);
};

const determineResourceCategory = (type: string, line: string): ResourceCategory => {
  if (line.includes("<storage")) return "storage";
  if (line.includes("<uniform")) return "uniform";
  if (type === "sampler") return "sampler";
  if (RESOURCE_TYPE_PATTERNS.texture.test(type)) return "texture";
  throw new Error(`Unable to determine resource category for type: ${type}`);
};

const parseVariableDeclaration = (line: string): { name: string; type: string; access?: string } => {
  // Try each pattern in order
  const storageMatch = line.match(PATTERNS.refStorageVariable);
  if (storageMatch) {
    const { name, type, access } = storageMatch.groups as { name: string; type: string; access: string };
    return { name, type, access };
  }

  const uniformMatch = line.match(PATTERNS.refUniformVariable);
  if (uniformMatch) {
    const { name, type } = uniformMatch.groups as { name: string; type: string };
    return { name, type };
  }

  const textureMatch = line.match(PATTERNS.refTextureVariable);
  if (textureMatch) {
    const { name, type } = textureMatch.groups as { name: string; type: string };
    return { name, type };
  }

  const samplerMatch = line.match(PATTERNS.refSamplerVariable);
  if (samplerMatch) {
    const { name } = samplerMatch.groups as { name: string };
    return { name, type: "sampler" };
  }

  throw new Error("Invalid variable declaration syntax");
};

const validateReferenceDeclaration = (line: string): readonly ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check if reference parameter exists
  if (!line.match(new RegExp(`${DECORATORS.ref}\\s*\\([^)]+\\)`))) {
    errors.push({ message: "Missing reference parameter" });
  }

  // Try to parse variable declaration
  try {
    parseVariableDeclaration(line);
  } catch (error: any) {
    errors.push({ message: error.message });
  }

  // Check parentheses matching
  const openParens = (line.match(/[\(\{<]/g) || []).length;
  const closeParens = (line.match(/[\)\}>]/g) || []).length;
  if (openParens !== closeParens) {
    errors.push({ message: "Mismatched parentheses/braces/brackets" });
  }

  // Check binding order if both present
  const hasGroup = line.includes(DECORATORS.group);
  const hasBinding = line.includes(DECORATORS.binding);
  if (hasBinding && hasGroup) {
    const groupIndex = line.indexOf(DECORATORS.group);
    const bindingIndex = line.indexOf(DECORATORS.binding);
    if (bindingIndex < groupIndex) {
      errors.push({ message: "When both are present, @group must come before @binding" });
    }
  }

  return errors;
};

const parseReferenceDecorators = (line: string) => {
  const refPattern = new RegExp(`${DECORATORS.ref}\\s*\\(([^)]+)\\)`);
  const matches = {
    ref: line.match(refPattern),
    group: line.match(new RegExp(PATTERNS.groupDecorator)),
    binding: line.match(new RegExp(PATTERNS.bindingDecorator)),
  };

  if (!matches.ref) {
    throw new Error(`Missing required ${DECORATORS.ref} decorator`);
  }

  const reference = matches.ref[1].trim();
  if (!validateReferenceFormat(reference)) {
    throw new Error("Invalid reference format. Must be in the form 'node_name.resource_name'");
  }

  return {
    reference,
    group: matches.group ? parseInt(matches.group[1], 10) : undefined,
    binding: matches.binding ? parseInt(matches.binding[1], 10) : undefined,
  };
};

const parseReferenceDeclaration = (line: string, index: number): ReferenceObject | null => {
  const errors = validateReferenceDeclaration(line);
  if (errors.length > 0) {
    errors.forEach((err) => console.error(`Reference at position ${index}: ${err.message}`));
    console.error("Original declaration:\n" + line.trim());
    return null;
  }

  try {
    const decorators = parseReferenceDecorators(line);
    const { name, type, access } = parseVariableDeclaration(line);
    const [nodeName, resourceName] = decorators.reference.split(".");

    if (!name || !type || !nodeName || !resourceName) {
      throw new Error("Failed to extract required reference components");
    }

    const category = determineResourceCategory(type, line);

    return {
      usedInBody: true,
      resourceType: RESOURCE_TYPE.REF,
      name,
      type,
      node: nodeName,
      ref: resourceName,
      category,
      access: access as any,
      group: decorators.group || 0,
      binding: decorators.binding || -1,
      declarationIndex: index,
      wildcards: [], // References don't directly use wildcards, they inherit from referenced resource
    };
  } catch (error: any) {
    console.error(`Reference at position ${index}: ${error.message}`);
    return null;
  }
};

const parseReferences = (code: string) => {
  const refLines = code.match(PATTERNS.refLinePattern) || [];

  if (!refLines.length) {
    return [];
  }

  const parsedReferences = refLines
    .map((line, index) => parseReferenceDeclaration(line, index))
    .filter((ref): ref is ReferenceObject => ref !== null);

  return parsedReferences;
};

const parseResources = (code: string, wildcards: WildCard[]) => {
  const parsedTextures = parseTextures(code, wildcards) as ResourceBase[];
  const parsedBuffers = parseBuffers(code, wildcards) as ResourceBase[];
  const parsedUniforms = parseUniforms(code, wildcards) as ResourceBase[];
  const parsedSamplers = parseSamplers(code, wildcards) as ResourceBase[];
  const parsedReferences = parseReferences(code) as ResourceBase[];
  const allResources = [...parsedTextures, ...parsedBuffers, ...parsedUniforms, ...parsedSamplers, ...parsedReferences];

  return computeBindingIndices(allResources);
};

const SHADER_DECORATORS = {
  compute: "@compute",
  fragment: "@fragment",
  resolve: "@resolve",
  workgroupSize: "@workgroup_size",
  canvas: "@canvas",
} as const;

// Validation patterns for the new decorators
const SHADER_PATTERNS = {
  computeDecorator: new RegExp(`${SHADER_DECORATORS.compute}\\s*\\(([^)]+)\\)`),
  fragmentDecorator: /@fragment\s*\(\s*(?:@canvas\s*\(([^)]+)\)|@canvas|([^)]+))\s*\)/,
  resolveDecorator: /@resolve\s*\(\s*([^)]+)\s*\)/,
  canvasWithResolution: /@canvas\s*\(\s*([^)]+)\s*\)/,
  canvasNoParams: /@canvas(?!\s*\()/, // Matches @canvas with no parameters
  workgroupSizeDecorator: new RegExp(`${SHADER_DECORATORS.workgroupSize}\\s*\\(([^)]+)\\)`),
  canvasDecorator: new RegExp(`${SHADER_DECORATORS.canvas}`),
} as const;

// Types for internal use
type ShaderType = "compute" | "fragment" | "resource";
type ComputeDimension = "1d" | "2d" | "3d";

interface ComputeShaderMetadata {
  type: ComputeDimension;
  workgroupSize: [number, number, number];
  threadCount: [number, number, number];
}

interface FragmentShaderMetadata {
  view: string;
  resolveTarget?: string;
  canvas: boolean;
  canvasSize?: number[]; // Added to store canvas dimensions when specified
}

interface ShaderMetadata {
  type: ShaderType;
  metadata?: ComputeShaderMetadata | FragmentShaderMetadata;
  resources: ResourceBase[];
  code: string;
}

// Default workgroup sizes based on dimension
const DEFAULT_WORKGROUP_SIZES: Record<ComputeDimension, [number, number, number]> = {
  "1d": [64, 1, 1],
  "2d": [8, 8, 1],
  "3d": [4, 4, 4],
};

// Determine compute shader dimension from workgroup count
const getComputeDimension = (workgroupCount: number[]): ComputeDimension => {
  switch (workgroupCount.length) {
    case 1:
      return "1d";
    case 2:
      return "2d";
    case 3:
      return "3d";
    default:
      throw new Error(`Invalid number of workgroup count parameters: ${workgroupCount.length}`);
  }
};

// Pad array to 3D with 1s
const padTo3D = (arr: number[]): [number, number, number] => {
  return [...arr, ...Array(3 - arr.length).fill(1)] as [number, number, number];
};

// Parse compute shader metadata
const parseComputeMetadata = (code: string, wildcards: WildCard[] = []): ComputeShaderMetadata => {
  // Parse workgroup count from @compute decorator
  const computeMatch = code.match(SHADER_PATTERNS.computeDecorator);
  if (!computeMatch) {
    throw new Error("Compute shader must have @compute decorator with workgroup count");
  }

  // Parse provided workgroup count values with wildcard support
  const rawWorkgroupCount = evaluateWildcardExpression(computeMatch[1], wildcards);
  const dimension = getComputeDimension(rawWorkgroupCount);
  const workgroupCount = padTo3D(rawWorkgroupCount);

  // Parse workgroup size (optional, has defaults)
  const workgroupSizeMatch = code.match(SHADER_PATTERNS.workgroupSizeDecorator);
  let workgroupSize: [number, number, number];

  if (workgroupSizeMatch) {
    // Parse provided workgroup size values with wildcard support
    const rawSizes = evaluateWildcardExpression(workgroupSizeMatch[1], wildcards);

    // Validate workgroup size dimensions match compute dimensions
    if (rawSizes.length > rawWorkgroupCount.length) {
      throw new Error(
        `@workgroup_size has more dimensions (${rawSizes.length}D) than @compute (${rawWorkgroupCount.length}D)`
      );
    }

    workgroupSize = padTo3D(rawSizes);
  } else {
    workgroupSize = DEFAULT_WORKGROUP_SIZES[dimension];
  }

  return {
    type: dimension,
    workgroupSize,
    threadCount: workgroupCount,
  };
};

// Parse fragment shader metadata
const validateCanvasSize = (size: number[], decoratorName: string): void => {
  if (size.length !== 2) {
    throw new Error(
      `${decoratorName} requires exactly 2 dimensions (width, height), got ${size.length} ` +
        `[${size.join(", ")}]. Use either two numbers or info.resolution.xy`
    );
  }

  // Validate each dimension
  size.forEach((dim, index) => {
    if (!Number.isFinite(dim)) {
      throw new Error(
        `Invalid ${index === 0 ? "width" : "height"} in ${decoratorName}: ${dim}. ` + `Expected a finite number`
      );
    }
    if (!Number.isInteger(dim)) {
      throw new Error(
        `Invalid ${index === 0 ? "width" : "height"} in ${decoratorName}: ${dim}. ` +
          `Canvas dimensions must be integers`
      );
    }
    if (dim <= 0) {
      throw new Error(
        `Invalid ${index === 0 ? "width" : "height"} in ${decoratorName}: ${dim}. ` +
          `Canvas dimensions must be positive`
      );
    }
    // Add reasonable upper limit to prevent massive canvas sizes
    if (dim > 16384) {
      throw new Error(`${index === 0 ? "Width" : "Height"} exceeds maximum allowed size (16384): ${dim}`);
    }
  });
};

const parseFragmentMetadata = (
  code: string,
  resources: ResourceBase[],
  wildcards: WildCard[] = []
): FragmentShaderMetadata => {
  // Parse target texture from @fragment decorator
  const fragmentMatch = code.match(SHADER_PATTERNS.fragmentDecorator);
  if (!fragmentMatch) {
    throw new Error("Fragment shader must have @fragment decorator");
  }

  let view: string;
  let canvas = false;
  let canvasSize: number[] | undefined;

  // fragmentMatch[1] will contain canvas parameters if present
  // fragmentMatch[2] will contain texture name if no @canvas
  if (fragmentMatch[1] !== undefined) {
    // We have @canvas with parameters
    canvas = true;
    try {
      // Use wildcard evaluation for canvas size
      canvasSize = evaluateWildcardExpression(fragmentMatch[1], wildcards);
      // Validate canvas dimensions
      validateCanvasSize(canvasSize, "@canvas");
      view = "canvas";
    } catch (error: any) {
      throw new Error(`Invalid @canvas parameters: ${error.message}`);
    }
  } else if (fragmentMatch[2] !== undefined) {
    // We have a texture name
    view = fragmentMatch[2].trim();
    if (!view) {
      throw new Error("@fragment decorator must specify a target texture");
    }
  } else {
    // We have plain @canvas with no parameters
    canvas = true;
    canvasSize = [window.innerWidth, window.innerHeight];
    view = "canvas";
  }

  // Parse optional resolve target
  const resolveMatch = code.match(SHADER_PATTERNS.resolveDecorator);
  const resolveTarget = resolveMatch ? resolveMatch[1].trim() : undefined;

  // Validate that we don't have a resolve target for canvas output
  if (canvas && resolveTarget) {
    throw new Error("Cannot specify @resolve target when using @canvas as fragment output");
  }

  const viewResource = resources.find((r) => r.name === view);
  if (viewResource && viewResource.usedInBody) {
    throw new Error(`Cannot render to texture '${view}' as it is used within the shader body`);
  }

  return {
    view,
    resolveTarget,
    canvas,
    canvasSize,
  };
};

interface Section {
  type: "code" | "protected";
  content: string;
}

interface ResourceBase {
  name: string;
  group: number;
  binding: number;
}

// Extract shader metadata
const extractShaderMetadata = (shader: string, wildcards: WildCard[]) => {
  const workgroupMatch = shader.match(/@workgroup_size\s*\(([^)]*)\)/);
  const workgroupSize = workgroupMatch ? workgroupMatch[1].trim() : null;

  const isComputeShader = SHADER_PATTERNS.computeDecorator.test(shader);
  let computeDimension = 2; // Default to 2D

  if (isComputeShader) {
    const computeMatch = shader.match(/@compute\s*\(([^)]*)\)/);
    if (computeMatch) {
      const expression = computeMatch[1].trim();

      // Check if expression contains wildcards
      const wildcardMatch = wildcards.find((w) => expression.includes(`${WILDCARDS_PREFIX}${w.name}`));

      if (wildcardMatch) {
        // Use the wildcard's dimension
        computeDimension = wildcardMatch.value.length;
      } else {
        // No wildcards, use comma count
        const params = expression.split(",").map((p) => p.trim());
        computeDimension = params.length;
      }
    }
  }

  return { workgroupSize, isComputeShader, computeDimension };
};
// Split shader code into protected and unprotected sections
const splitCodeIntoSections = (code: string): Section[] => {
  const sections: Section[] = [];
  let currentSection = "";
  let braceCount = 0;
  let currentPosition = 0;
  let inFunction = false;

  while (currentPosition < code.length) {
    const remainingCode = code.slice(currentPosition);

    if (!inFunction && !braceCount) {
      const fnMatch = remainingCode.match(/^(\s*fn\s+\w+\s*\([^{]*)/);
      if (fnMatch) {
        if (currentSection) {
          sections.push({ type: "code", content: currentSection });
          currentSection = "";
        }
        currentSection = fnMatch[1];
        currentPosition += fnMatch[1].length;
        inFunction = true;
        continue;
      }
    }

    const char = code[currentPosition];

    if (char === "{") {
      if (braceCount === 0 && !inFunction) {
        if (currentSection) {
          sections.push({ type: "code", content: currentSection });
        }
        currentSection = "{";
      } else {
        currentSection += char;
      }
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      currentSection += char;

      if (braceCount === 0) {
        sections.push({ type: "protected", content: currentSection });
        currentSection = "";
        inFunction = false;
      }
    } else {
      currentSection += char;
    }

    currentPosition++;
  }

  if (currentSection) {
    sections.push({
      type: braceCount > 0 || inFunction ? "protected" : "code",
      content: currentSection,
    });
  }

  return sections;
};

// Process unprotected code sections
const processCodeSection = (content: string, resources: ResourceBase[]): string => {
  return content
    .split("\n")
    .map((line) => {
      if (!line.trim() || line.trim().startsWith("struct")) {
        return line;
      }

      let processedLine = line;

      // Remove nested decorators
      while (/@\w+\s*\(([^()]*|\([^()]*\))*\)/.test(processedLine)) {
        processedLine = processedLine.replace(/@\w+\s*\(([^()]*|\([^()]*\))*\)/g, "");
      }

      // Remove main decorators
      processedLine = removeDecorators(processedLine);

      // Add group and binding for variable declarations
      if (processedLine.includes("var") && processedLine.includes(":")) {
        processedLine = addGroupAndBinding(processedLine, resources);
      }

      return processedLine;
    })
    .join("\n");
};

// Helper function to remove decorators
const removeDecorators = (line: string): string => {
  return line
    .replace(new RegExp(`${DECORATORS.texture}\\s*\\([^)]*\\)`, "g"), "")
    .replace(new RegExp(`${DECORATORS.buffer}\\s*\\([^)]*\\)`, "g"), "")
    .replace(new RegExp(`${DECORATORS.uniform}\\s*\\([^)]*\\)`, "g"), "")
    .replace(new RegExp(`${DECORATORS.sampler}`, "g"), "")
    .replace(new RegExp(`${DECORATORS.ref}\\s*\\([^)]*\\)`, "g"), "");
};

// Helper function to add group and binding
const addGroupAndBinding = (line: string, resources: ResourceBase[]): string => {
  const beforeColon = line.split(":")[0];
  const words = beforeColon.split(/\s+/);
  const name = words[words.length - 1];

  if (name) {
    const resource = resources.find((r) => r.name === name);
    if (resource && !line.includes(DECORATORS.group)) {
      return `@group(${resource.group}) @binding(${resource.binding}) ${line}`;
    }
  }
  return line;
};

// Main transformation function
const transformToWGSL = (shader: string, resources: ResourceBase[], wildcards: WildCard[]): string => {
  // Extract metadata
  const { workgroupSize, isComputeShader, computeDimension } = extractShaderMetadata(shader, wildcards);

  // Handle entry point decorators
  let wgslCode = shader
    .replace(SHADER_PATTERNS.computeDecorator, "@compute")
    .replace(SHADER_PATTERNS.fragmentDecorator, "@fragment");

  // Split and process code sections
  const sections = splitCodeIntoSections(wgslCode);
  wgslCode = sections
    .map((section) => {
      return section.type === "protected" ? section.content : processCodeSection(section.content, resources);
    })
    .join("\n");

  // Clean up empty lines
  wgslCode = wgslCode
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // Add workgroup size for compute shaders
  if (isComputeShader) {
    const finalWorkgroupSize = workgroupSize || DEFAULT_WORKGROUP_SIZES[`${computeDimension}d` as ComputeDimension];
    wgslCode = wgslCode.replace("@compute\nfn main", `@compute @workgroup_size(${finalWorkgroupSize})\nfn main`);
  }

  return wgslCode;
};
// function dependsOnResolutionWildcard(resources: ResourceBase[]) {
//   for (let i = 0; i < resources.length; i++) {
//     const r = resources[i] as TextureObject;
//     if (r.wildcards.includes(WILDCARDS.resolution)) return true;
//   }

//   return false;
// }

// Main parsing function
const parseShader = (inputCode: string, wildcards: WildCard[] = []): ShaderMetadata => {
  try {
    const shaderCode = removeComments(inputCode);
    const hasCompute = SHADER_PATTERNS.computeDecorator.test(shaderCode);
    const hasFragment = SHADER_PATTERNS.fragmentDecorator.test(shaderCode);

    if (hasCompute && hasFragment) {
      throw new Error("Shader cannot be both compute and fragment");
    }

    // Parse resources with wildcards
    const resources = parseResources(shaderCode, wildcards);
    const code = transformToWGSL(shaderCode, resources, wildcards);

    // const dependsOnResolution = resources.some((resource) =>
    //   resource.wildcards.some((wildcard) => wildcards.some((w) => w.name === wildcard.replace(WILDCARDS_PREFIX, "")))
    // );

    if (hasCompute) {
      return {
        type: "compute",
        metadata: parseComputeMetadata(shaderCode, wildcards),
        resources,
        code,
      };
    }

    if (hasFragment) {
      return {
        type: "fragment",
        metadata: parseFragmentMetadata(shaderCode, resources, wildcards),
        resources,
        code,
      };
    }

    return {
      type: "resource",
      resources,
      code,
    };
  } catch (error: any) {
    throw new Error(`Shader parsing error: ${error.message}`);
  }
};
interface ShaderMetadataDiff {
  shaderReset: boolean;
  // dependsOnResolutionChanged: boolean;
  deletions: ResourceBase[];
  additions: ResourceBase[];
  reorders: ResourceBase[];
}

function diffShaderMetadata(before: ShaderMetadata, after: ShaderMetadata): ShaderMetadataDiff {
  const result: ShaderMetadataDiff = {
    shaderReset: false,
    // dependsOnResolutionChanged: false,
    deletions: [],
    additions: [],
    reorders: [],
  };

  // Step 1: Check if shader needs reset
  result.shaderReset = before.type !== after.type || !areMetadataEqual(before.metadata, after.metadata);
  // result.dependsOnResolutionChanged = before.dependsOnResolution !== after.dependsOnResolution;

  // Step 2 & 3: Handle resource changes
  const beforeMap = new Map(before.resources.map((r) => [getResourceKey(r), r]));
  const afterMap = new Map(after.resources.map((r) => [getResourceKey(r), r]));

  // Find deletions and potential reorders
  for (const beforeResource of before.resources) {
    const key = getResourceKey(beforeResource);
    const afterResource = afterMap.get(key);

    if (!afterResource) {
      // Resource was deleted
      result.deletions.push(beforeResource);
    } else if (beforeResource.binding !== afterResource.binding) {
      // Only binding changed - this is a reorder
      if (areResourcesEqualExceptBinding(beforeResource, afterResource)) {
        result.reorders.push(afterResource);
      } else {
        // Resource was modified (and binding changed)
        result.deletions.push(beforeResource);
        result.additions.push(afterResource);
      }
    } else if (!areResourcesEqual(beforeResource, afterResource)) {
      // Resource was modified
      result.deletions.push(beforeResource);
      result.additions.push(afterResource);
    }
  }

  // Find additions
  for (const afterResource of after.resources) {
    const key = getResourceKey(afterResource);
    if (!beforeMap.has(key)) {
      result.additions.push(afterResource);
    }
  }

  return result;
}

// Helper function to generate a unique key for a resource
function getResourceKey(resource: ResourceBase): string {
  return `${resource.name}_${resource.group}_${resource.resourceType}`;
}

// Helper function to check if two resources are equal except for binding
function areResourcesEqualExceptBinding(a: ResourceBase, b: ResourceBase): boolean {
  const aClone = { ...a, binding: b.binding };
  const bClone = { ...b };
  return areResourcesEqual(aClone, bClone);
}

// Helper function to deeply compare two resources
function areResourcesEqual(a: ResourceBase, b: ResourceBase): boolean {
  // First check basic ResourceBase properties
  if (
    !(
      a.name === b.name &&
      a.group === b.group &&
      a.resourceType === b.resourceType &&
      a.declarationIndex === b.declarationIndex &&
      a.usedInBody === b.usedInBody &&
      arraysEqual(a.wildcards, b.wildcards)
    )
  ) {
    return false;
  }

  // Then check specific resource type properties based on resourceType
  switch (a.resourceType) {
    case RESOURCE_TYPE.TEX:
      return areTextureResourcesEqual(a as TextureObject, b as TextureObject);
    case RESOURCE_TYPE.BUF:
      return areBufferResourcesEqual(a as BufferObject, b as BufferObject);
    case RESOURCE_TYPE.UNI:
      return areUniformResourcesEqual(a as UniformObject, b as UniformObject);
    case RESOURCE_TYPE.SAMP:
      return areSamplerResourcesEqual(a as SamplerObject, b as SamplerObject);
    case RESOURCE_TYPE.REF:
      return areReferenceResourcesEqual(a as ReferenceObject, b as ReferenceObject);
    default:
      return true;
  }
}

// Helper function to compare arrays
function arraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

// Type-specific comparison functions
function areTextureResourcesEqual(a: TextureObject, b: TextureObject): boolean {
  return arraysEqual(a.size, b.size) && a.format === b.format && a.type === b.type;
}

function areBufferResourcesEqual(a: BufferObject, b: BufferObject): boolean {
  return a.size === b.size && a.type === b.type && a.access === b.access && a.stride === b.stride;
}

function areUniformResourcesEqual(a: UniformObject, b: UniformObject): boolean {
  return a.type === b.type && JSON.stringify(a.defaults) === JSON.stringify(b.defaults) && a.size === b.size;
}

function areSamplerResourcesEqual(a: SamplerObject, b: SamplerObject): boolean {
  return (
    a.addressModeU === b.addressModeU &&
    a.addressModeV === b.addressModeV &&
    a.addressModeW === b.addressModeW &&
    a.magFilter === b.magFilter &&
    a.minFilter === b.minFilter &&
    a.mipmapFilter === b.mipmapFilter &&
    a.lodMinClamp === b.lodMinClamp &&
    a.lodMaxClamp === b.lodMaxClamp &&
    a.compare === b.compare &&
    a.maxAnisotropy === b.maxAnisotropy
  );
}

function areReferenceResourcesEqual(a: ReferenceObject, b: ReferenceObject): boolean {
  return (
    a.node === b.node && a.ref === b.ref && a.type === b.type && a.category === b.category && a.access === b.access
  );
}

// Helper function to compare metadata objects
function areMetadataEqual(
  before?: ComputeShaderMetadata | FragmentShaderMetadata,
  after?: ComputeShaderMetadata | FragmentShaderMetadata
): boolean {
  if (!before && !after) return true;
  if (!before || !after) return false;

  if ("workgroupSize" in before && "workgroupSize" in after) {
    return (
      arraysEqual(before.workgroupSize, after.workgroupSize) &&
      arraysEqual(before.threadCount, after.threadCount) &&
      before.type === after.type
    );
  }

  if ("view" in before && "view" in after) {
    return (
      before.view === after.view &&
      before.resolveTarget === after.resolveTarget &&
      before.canvas === after.canvas &&
      (before.canvasSize && after.canvasSize
        ? arraysEqual(before.canvasSize, after.canvasSize)
        : before.canvasSize === after.canvasSize)
    );
  }

  return false;
}

type StructDefinition = {
  fields: Record<string, string>; // fieldName -> fieldType
};
function parseWGSLStruct(structCode: string): StructDefinition {
  // Match the struct content between braces
  const match = structCode.match(/struct\s+\w+\s*\{([^}]+)\}/);
  if (!match) throw new Error("Invalid struct definition");

  const fields: Record<string, string> = {};
  const fieldLines = match[1]
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of fieldLines) {
    const [name, type] = line.split(":").map((s) => s.trim());
    if (name && type) {
      fields[name] = type;
    }
  }

  return { fields };
}

function getWGSLTypeSize(type: string, structCode?: string): number {
  // Handle basic types
  const basicTypes: Record<string, number> = {
    f32: 4,
    i32: 4,
    u32: 4,
    f16: 2,
    i16: 2,
    u16: 2,
    i8: 1,
    u8: 1,
    bool: 1,
  };

  // Handle vectors
  const vecMatch = type.match(/vec(\d+)<(\w+)>/);
  if (vecMatch) {
    const [, count, baseType] = vecMatch;
    return basicTypes[baseType] * Number(count);
  }

  // Handle matrices
  const matMatch = type.match(/mat(\d+)x(\d+)<(\w+)>/);
  if (matMatch) {
    const [, rows, cols, baseType] = matMatch;
    return basicTypes[baseType] * Number(rows) * Number(cols);
  }

  // Handle fixed-size arrays
  const fixedArrayMatch = type.match(/array<(.+),\s*(\d+)>/);
  if (fixedArrayMatch) {
    const [, innerType, count] = fixedArrayMatch;
    return getWGSLTypeSize(innerType, structCode) * Number(count);
  }

  // Handle dynamic arrays
  const arrayMatch = type.match(/array<(.+)>/);
  if (arrayMatch) {
    const innerType = arrayMatch[1];
    return getWGSLTypeSize(innerType, structCode);
  }

  // Handle structs
  if (type.startsWith("struct") || structCode?.includes(type)) {
    if (!structCode) {
      throw new Error(`Struct definition for "${type}" not provided`);
    }
    const struct = parseWGSLStruct(structCode);
    return Object.values(struct.fields).reduce((total, fieldType) => total + getWGSLTypeSize(fieldType, structCode), 0);
  }

  // Try as basic type
  const size = basicTypes[type];
  if (size === undefined) {
    throw new Error(`Unknown type: ${type}`);
  }

  return size;
}

export {
  diffShaderMetadata,
  getWGSLTypeSize,
  parseShader,
  type BufferObject,
  type ComputeShaderMetadata,
  type FragmentShaderMetadata,
  type ParsedDecorators,
  type ReferenceObject,
  type ResourceBase,
  type SamplerObject,
  type ShaderMetadata,
  type TextureObject,
  type UniformObject,
  type ValidationError,
};
